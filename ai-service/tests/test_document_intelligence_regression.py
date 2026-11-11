"""
Automated Document Intelligence Regression Test Suite
Tests complete extraction, NER, classification, clause detection, risk analysis, and obligations.
"""

import os
import sys
from pathlib import Path

# Add app to path
TESTS_DIR = Path(__file__).resolve().parent
SERVICE_ROOT = TESTS_DIR.parent
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

from app.services.extraction_service import extract_text
from app.services.preprocessing_service import preprocess_chunks
from app.services.classification_service import classify_document
from app.services.ner_service import extract_entities
from app.services.clause_service import extract_clauses, evaluate_missing_provisions
from app.services.risk_service import analyze_document_risk
from app.services.summary_service import generate_document_summary

TEST_PDF_PATH = "/Users/trush/Desktop/LegalMindAI/storage/6acbc333d903edb693916408/sample_software_development_services_agreement.pdf"


def test_pdf_extraction_and_chunking():
    """Verify section-aware extraction without cross-section text overlap."""
    assert os.path.exists(TEST_PDF_PATH), f"Test file not found: {TEST_PDF_PATH}"

    res = extract_text(TEST_PDF_PATH, "doc_test", "pdf")
    assert res.total_pages == 4
    assert res.extraction_method == "pymupdf"
    assert len(res.chunks) == 21, f"Expected 21 section chunks, got {len(res.chunks)}"

    prep = preprocess_chunks(res.chunks, "doc_test")
    assert len(prep.chunks) == 21, f"Expected 21 preprocessed chunks, got {len(prep.chunks)}"

    sections = [c.section for c in prep.chunks]
    assert "PREAMBLE" in sections
    assert "1" in sections
    assert "6" in sections
    assert "7" in sections
    assert "15" in sections
    assert "18" in sections
    assert "SCHEDULE A" in sections
    assert "SCHEDULE B" in sections


def test_document_classification():
    """Verify hierarchical legal classification."""
    res = extract_text(TEST_PDF_PATH, "doc_test", "pdf")
    prep = preprocess_chunks(res.chunks, "doc_test")
    full_sample = " ".join(c.text for c in prep.chunks[:8])

    clf = classify_document(full_sample, "sample_software_development_services_agreement.pdf", [c.to_dict() for c in prep.chunks])
    assert clf.primary_category == "Business Agreement", f"Got: {clf.primary_category}"
    assert clf.subtype == "Software Development Services Agreement", f"Got: {clf.subtype}"
    assert "Services / Vendor Agreement" in clf.related_type, f"Got: {clf.related_type}"
    assert clf.confidence >= 0.85, f"Confidence too low: {clf.confidence}"


def test_contracting_parties_extraction():
    """Verify separate parties extraction with addresses and signatories."""
    res = extract_text(TEST_PDF_PATH, "doc_test", "pdf")
    prep = preprocess_chunks(res.chunks, "doc_test")
    ner = extract_entities(prep.chunks, "doc_test")

    assert len(ner.structured_parties) == 2, f"Expected 2 parties, got {len(ner.structured_parties)}"

    party_names = [p.name for p in ner.structured_parties]
    party_roles = {p.name: p.role for p in ner.structured_parties}

    assert "Northstar Retail Solutions Pvt. Ltd." in party_names
    assert party_roles["Northstar Retail Solutions Pvt. Ltd."] == "CLIENT"

    assert "BrightCode Technologies" in party_names
    assert party_roles["BrightCode Technologies"] == "SERVICE PROVIDER"

    # Verify no merged headers
    for p in ner.structured_parties:
        assert "CLIENT SERVICE PROVIDER" not in p.name
        assert "SERVICE PROVIDER Northstar" not in p.name

    # Verify signatories
    signatories = {p.name: p.signatory_name for p in ner.structured_parties}
    assert signatories["Northstar Retail Solutions Pvt. Ltd."] == "Aanya Shah"
    assert signatories["BrightCode Technologies"] == "Rohan Mehta"


def test_financial_extraction():
    """Verify milestone payments, total contract value, and deadline."""
    res = extract_text(TEST_PDF_PATH, "doc_test", "pdf")
    prep = preprocess_chunks(res.chunks, "doc_test")
    ner = extract_entities(prep.chunks, "doc_test")

    amounts = [f.amount for f in ner.structured_finances if f.amount > 0]
    assert 120000.0 in amounts, f"Missing total contract value: {amounts}"
    assert 36000.0 in amounts, f"Missing 36,000 milestone: {amounts}"
    assert 48000.0 in amounts, f"Missing 48,000 milestone: {amounts}"

    # Verify zero false positives
    for f in ner.structured_finances:
        assert "3.2" not in f.original_text
        assert f.original_text.lower().strip() != "rs."

    # Verify payment deadline
    deadline_terms = [f for f in ner.structured_finances if f.term_type == "PAYMENT_DEADLINE"]
    assert len(deadline_terms) > 0
    assert "fifteen (15) calendar days" in deadline_terms[0].original_text.lower()


def test_date_extraction_filtering():
    """Verify context-aware date extraction excludes PIN codes and street numbers."""
    res = extract_text(TEST_PDF_PATH, "doc_test", "pdf")
    prep = preprocess_chunks(res.chunks, "doc_test")
    ner = extract_entities(prep.chunks, "doc_test")

    date_values = [d.value.lower() for d in ner.structured_dates]

    # Must contain key legal dates and periods
    assert any("1 november 2026" in v for v in date_values), "Missing effective date"
    assert any("six (6) weeks" in v for v in date_values), "Missing duration"
    assert any("fifteen (15) calendar days" in v for v in date_values), "Missing payment deadline"
    assert any("seven (7) business days" in v for v in date_values), "Missing acceptance period"
    assert any("thirty (30) days" in v for v in date_values), "Missing cure/notice period"

    # Must NOT contain PIN codes or street addresses
    for v in date_values:
        assert "395007" not in v, f"PIN code leaked into dates: {v}"
        assert "380015" not in v, f"PIN code leaked into dates: {v}"
        assert v.strip() not in ("44", "12", "3.2"), f"Invalid number as date: {v}"


def test_clause_detection_alignment():
    """Verify exact section number, page number, and clause classification alignment."""
    res = extract_text(TEST_PDF_PATH, "doc_test", "pdf")
    prep = preprocess_chunks(res.chunks, "doc_test")
    ner = extract_entities(prep.chunks, "doc_test")
    clauses = extract_clauses(prep.chunks, "doc_test", ner.entities)

    clause_map = {c.section: c for c in clauses.clauses}

    # Section 6: Client Responsibilities on Page 1
    sec6 = clause_map["6"]
    assert sec6.clause_type == "client_responsibilities"
    assert sec6.page == 1
    assert "CLIENT RESPONSIBILITIES" in sec6.clause_name.upper()
    assert "appoint a project contact" in sec6.text.lower()
    assert "sample document notice" not in sec6.text.lower()

    # Section 7: Acceptance and Corrections on Page 2
    sec7 = clause_map["7"]
    assert sec7.clause_type == "acceptance"
    assert sec7.page == 2
    assert "ACCEPTANCE" in sec7.clause_name.upper()
    assert "seven (7) business days" in sec7.text.lower()

    # Section 15: Independent Contractor on Page 3
    sec15 = clause_map["15"]
    assert sec15.clause_type == "independent_contractor"
    assert sec15.page == 3
    assert "independent contractor" in sec15.text.lower()
    assert "termination" not in sec15.clause_type

    # Section 5: Payment Terms on Page 1
    sec5 = clause_map["5"]
    assert sec5.clause_type == "payment"
    assert sec5.page == 1
    assert "inr 1,20,000" in sec5.text.lower()
    assert "entire agreement" not in sec5.text.lower()


def test_risk_analysis():
    """Verify transparent, evidence-based risk scoring."""
    res = extract_text(TEST_PDF_PATH, "doc_test", "pdf")
    prep = preprocess_chunks(res.chunks, "doc_test")
    ner = extract_entities(prep.chunks, "doc_test")
    clauses = extract_clauses(prep.chunks, "doc_test", ner.entities)
    risk = analyze_document_risk([c.to_dict() for c in clauses.clauses], "doc_test")

    # Transparent score: 32/100 (MEDIUM) with shared IP discount
    assert risk.overall_risk_score == 32, f"Expected 32, got {risk.overall_risk_score}"
    assert risk.overall_risk_level.lower() == "medium"
    assert risk.total_risks_found == 6, f"Expected 6 findings, got {risk.total_risks_found}"

    titles = [f.risk_title for f in risk.findings]
    # Check all 6 findings have human-readable titles
    assert any("Deemed Acceptance" in t for t in titles)
    assert any("IP Assignment" in t for t in titles)
    assert any("Pre-Existing" in t for t in titles)
    assert any("Liability" in t for t in titles)
    assert any("Termination" in t for t in titles)

    # Check that each finding has evidence, recommendation, score contribution, and concern
    for f in risk.findings:
        assert f.recommendation, f"Missing recommendation for {f.risk_title}"
        assert f.evidence, f"Missing statutory evidence for {f.risk_title}"
        assert f.score_contribution > 0, f"Score contribution missing for {f.risk_title}"
        assert f.contractual_concern, f"Contractual concern missing for {f.risk_title}"
        assert f.commercial_impact, f"Commercial impact missing for {f.risk_title}"
        assert f.page_number in (1, 2, 3, 4)


def test_word_count_and_raw_metrics():
    """Verify word count consistency and raw vs analyzed metrics."""
    res = extract_text(TEST_PDF_PATH, "doc_test", "pdf")
    prep = preprocess_chunks(res.chunks, "doc_test")

    # Analyzed words = 1295 (substantive legal text)
    assert prep.total_words == 1295, f"Expected 1295 analyzed words, got {prep.total_words}"
    # Raw document words = 1327 (includes watermarks and page numbers)
    assert res.raw_word_count == 1327, f"Expected 1327 raw words, got {res.raw_word_count}"
    # 32 words accounted for: 4 x watermark (24 words) + 4 x page footer (8 words)
    assert res.raw_word_count - prep.total_words == 32


def test_date_deadline_semantics():
    """Verify exact date and deadline semantics without cross-clause contamination."""
    res = extract_text(TEST_PDF_PATH, "doc_test", "pdf")
    prep = preprocess_chunks(res.chunks, "doc_test")
    ner = extract_entities(prep.chunks, "doc_test")

    # Map by (section, date_type)
    sec_type_map = {(d.section, d.date_type): d for d in ner.structured_dates}

    # Section 5: 15 calendar days — invoice payment deadline
    sec5_pay = sec_type_map.get(("5", "PAYMENT_DEADLINE"))
    assert sec5_pay is not None, "Missing Section 5 invoice payment deadline"
    assert sec5_pay.responsible_party == "Client"
    assert "invoice payment" in sec5_pay.event.lower()

    # Section 6: 5 business days — client feedback period
    sec6_feed = sec_type_map.get(("6", "CLIENT_FEEDBACK_PERIOD"))
    assert sec6_feed is not None, "Missing Section 6 client feedback period"
    assert sec6_feed.responsible_party == "Client"
    assert "feedback" in sec6_feed.event.lower()

    # Section 7: 7 business days — acceptance testing period
    sec7_acc = sec_type_map.get(("7", "ACCEPTANCE_PERIOD"))
    assert sec7_acc is not None, "Missing Section 7 acceptance testing period"
    assert sec7_acc.responsible_party == "Client"
    assert "acceptance testing" in sec7_acc.event.lower()

    # Section 14: 15 calendar days — material breach cure period
    sec14_cure = sec_type_map.get(("14", "CURE_PERIOD"))
    assert sec14_cure is not None, "Missing Section 14 material breach cure period"
    assert sec14_cure.responsible_party == "Breaching Party"
    assert "cure" in sec14_cure.event.lower() or "remedy" in sec14_cure.event.lower()

    # Section 14: 30 days — termination for convenience notice (NOT a cure period!)
    sec14_not = sec_type_map.get(("14", "NOTICE_PERIOD"))
    assert sec14_not is not None, "Missing Section 14 convenience notice period"
    assert sec14_not.responsible_party == "Terminating Party"
    assert "convenience" in sec14_not.event.lower()
    assert sec14_not.date_type != "CURE_PERIOD", "30-day notice period must NOT be classified as cure period"

    # Section 16: 30 days — dispute resolution discussion period
    sec16_disp = sec_type_map.get(("16", "DISPUTE_DISCUSSION_PERIOD"))
    assert sec16_disp is not None, "Missing Section 16 dispute discussion period"
    assert sec16_disp.responsible_party == "Both Parties"
    assert "dispute" in sec16_disp.event.lower()

    # Verify every duration preserves required metadata
    for d in ner.structured_dates:
        if d.duration and d.unit:
            assert d.event, f"Missing event for {d.value}"
            assert d.responsible_party, f"Missing responsible party for {d.value}"
            assert d.clause_reference, f"Missing clause reference for {d.value}"
            assert d.page in (1, 2, 3, 4), f"Invalid page for {d.value}"
            assert d.original_supporting_text, f"Missing supporting text for {d.value}"


def test_missing_provisions_analysis():
    """Verify audit of 9 key software agreement provisions."""
    res = extract_text(TEST_PDF_PATH, "doc_test", "pdf")
    prep = preprocess_chunks(res.chunks, "doc_test")
    ner = extract_entities(prep.chunks, "doc_test")
    clauses = extract_clauses(prep.chunks, "doc_test", ner.entities)

    missing_eval = evaluate_missing_provisions([c.to_dict() for c in clauses.clauses])
    assert len(missing_eval) == 9, f"Expected 9 provisions, got {len(missing_eval)}"

    eval_by_id = {p["id"]: p for p in missing_eval}

    assert eval_by_id["post_handover_warranty"]["status"] == "PARTIALLY_PRESENT"
    assert eval_by_id["maintenance_and_support"]["status"] == "MISSING"
    assert eval_by_id["force_majeure"]["status"] == "MISSING"
    assert eval_by_id["security_incident_notification"]["status"] == "PARTIALLY_PRESENT"
    assert eval_by_id["backup_and_data_deletion"]["status"] == "MISSING"
    assert eval_by_id["source_code_handover"]["status"] == "PRESENT"
    assert eval_by_id["third_party_licensing"]["status"] == "PARTIALLY_PRESENT"
    assert eval_by_id["confidentiality_survival"]["status"] == "PARTIALLY_PRESENT"
    assert eval_by_id["dispute_resolution_procedure"]["status"] == "PARTIALLY_PRESENT"

    for p in missing_eval:
        assert p["name"]
        assert p["details"]
        assert p["significance"] in ("CRITICAL", "HIGH", "MEDIUM", "LOW")
        assert p["commercial_legal_impact"]


def test_section_taxonomy_and_structure():
    """Verify structural vs substantive section taxonomy and headings."""
    res = extract_text(TEST_PDF_PATH, "doc_test", "pdf")
    prep = preprocess_chunks(res.chunks, "doc_test")
    ner = extract_entities(prep.chunks, "doc_test")
    clauses = extract_clauses(prep.chunks, "doc_test", ner.entities)

    clause_map = {c.section: c for c in clauses.clauses}

    # Section 1: Parties & Effective Date (STRUCTURAL)
    sec1 = clause_map["1"]
    assert sec1.clause_type == "parties"
    assert sec1.section_type == "STRUCTURAL"
    assert "Parties" in sec1.clause_name

    # Section 16: Governing Law and Dispute Resolution
    sec16 = clause_map["16"]
    assert sec16.clause_type == "governing_law_dispute"
    assert sec16.clause_name == "Governing Law and Dispute Resolution"
    assert sec16.section_type == "SUBSTANTIVE"

    # Section 18: Execution & Signatures (STRUCTURAL)
    sec18 = clause_map["18"]
    assert sec18.clause_type == "signatures"
    assert sec18.section_type == "STRUCTURAL"
    assert "Execution" in sec18.clause_name or "Signature" in sec18.clause_name


def test_contractual_obligations():
    """Verify structured contractual obligations mapping."""
    res = extract_text(TEST_PDF_PATH, "doc_test", "pdf")
    prep = preprocess_chunks(res.chunks, "doc_test")
    ner = extract_entities(prep.chunks, "doc_test")
    clauses = extract_clauses(prep.chunks, "doc_test", ner.entities)

    summary = generate_document_summary(
        "doc_test",
        "Business Agreement",
        [c.to_dict() for c in prep.chunks],
        ner.parties,
        ner.dates,
        ner.amounts,
        [c.to_dict() for c in clauses.clauses],
        30,
        "medium",
    )

    assert len(summary.obligations) >= 8
    # Verify client and vendor obligations are present
    client_obs = [o for o in summary.obligations if "Northstar" in o.get("type", "") or "Client" in o.get("type", "")]
    vendor_obs = [o for o in summary.obligations if "BrightCode" in o.get("type", "") or "Provider" in o.get("type", "")]

    assert len(client_obs) > 0, "Missing client obligations"
    assert len(vendor_obs) > 0, "Missing vendor obligations"

    # Verify all 3 milestone payments are present in key points & plain summary
    key_points_text = " ".join(summary.key_points)
    assert "Payment 1" in key_points_text or "30%" in key_points_text
    assert "Payment 2" in key_points_text or "40%" in key_points_text
    assert "Payment 3" in key_points_text or "36,000" in key_points_text


def test_warranty_evidence_and_section_mapping():
    """Verify Section 12 is cited for warranties with zero 30-day warranty hallucination."""
    res = extract_text(TEST_PDF_PATH, "doc_test", "pdf")
    prep = preprocess_chunks(res.chunks, "doc_test")
    ner = extract_entities(prep.chunks, "doc_test")
    clauses = extract_clauses(prep.chunks, "doc_test", ner.entities)
    missing_eval = evaluate_missing_provisions([c.to_dict() for c in clauses.clauses])
    risk = analyze_document_risk([c.to_dict() for c in clauses.clauses], "doc_test")

    # 1. Missing provisions audit
    eval_by_id = {p["id"]: p for p in missing_eval}
    w_prov = eval_by_id["post_handover_warranty"]
    assert w_prov["actual_section_number"] == "12", f"Expected Section 12, got {w_prov['actual_section_number']}"
    assert "Warranties and Disclaimers" in w_prov["actual_section_heading"]
    assert "30-day warranty" not in w_prov["supporting_text"].lower()
    assert "30-day warranty" not in w_prov["details"].lower()
    assert "reasonable skill and care" in w_prov["supporting_text"].lower()
    assert "disclaims" in w_prov["details"].lower() or "disclaim" in w_prov["supporting_text"].lower()

    # 2. Risk findings audit
    for f in risk.findings:
        f_text = f"{f.risk_title} {f.explanation} {f.contractual_concern}".lower()
        assert "30-day warranty" not in f_text, f"Found 30-day warranty hallucination in risk finding: {f.risk_title}"
        if "warranty" in f.risk_title.lower() or "warranty" in f.clause_type.lower():
            assert f.section == "12", f"Warranty risk finding cites wrong section: {f.section}"


def test_confidentiality_survival_semantics():
    """Verify Section 9 confidentiality has no survival clause and deadline is marked unspecified."""
    res = extract_text(TEST_PDF_PATH, "doc_test", "pdf")
    prep = preprocess_chunks(res.chunks, "doc_test")
    ner = extract_entities(prep.chunks, "doc_test")
    clauses = extract_clauses(prep.chunks, "doc_test", ner.entities)
    missing_eval = evaluate_missing_provisions([c.to_dict() for c in clauses.clauses])

    eval_by_id = {p["id"]: p for p in missing_eval}
    conf_prov = eval_by_id["confidentiality_survival"]
    assert conf_prov["actual_section_number"] == "9"
    assert "Confidentiality" in conf_prov["actual_section_heading"]
    assert "NOT SPECIFIED" in " ".join(conf_prov["missing_elements"])

    summary = generate_document_summary(
        "doc_test",
        "Business Agreement",
        [c.to_dict() for c in prep.chunks],
        ner.parties,
        ner.dates,
        ner.amounts,
        [c.to_dict() for c in clauses.clauses],
        30,
        "medium",
    )
    conf_obs = [o for o in summary.structured_obligations if "confidential" in o.obligation.lower()]
    assert len(conf_obs) > 0
    for o in conf_obs:
        assert o.deadline == "Not specified in the agreement."
        assert "following termination" not in o.deadline.lower()
        assert o.supporting_evidence
        assert "9" in o.source_clause


def test_missing_provisions_all_nine_evidence_schema():
    """Verify all 9 missing provisions adhere strictly to the 8-key evidence structure and correct sections."""
    res = extract_text(TEST_PDF_PATH, "doc_test", "pdf")
    prep = preprocess_chunks(res.chunks, "doc_test")
    ner = extract_entities(prep.chunks, "doc_test")
    clauses = extract_clauses(prep.chunks, "doc_test", ner.entities)
    missing_eval = evaluate_missing_provisions([c.to_dict() for c in clauses.clauses])

    expected_provisions = {
        "post_handover_warranty": ("12", "Warranties and Disclaimers", "PARTIALLY_PRESENT"),
        "maintenance_and_support": (None, None, "MISSING"),
        "force_majeure": (None, None, "MISSING"),
        "security_incident_notification": ("11", "Data Protection and Security", "PARTIALLY_PRESENT"),
        "backup_and_data_deletion": (None, None, "MISSING"),
        "source_code_handover": ("3 & 10", "Deliverables & Intellectual Property", "PRESENT"),
        "third_party_licensing": ("10", "Intellectual Property", "PARTIALLY_PRESENT"),
        "confidentiality_survival": ("9", "Confidentiality", "PARTIALLY_PRESENT"),
        "dispute_resolution_procedure": ("16", "Governing Law and Dispute Resolution", "PARTIALLY_PRESENT"),
    }

    assert len(missing_eval) == 9
    for p in missing_eval:
        p_id = p["id"]
        assert p_id in expected_provisions, f"Unexpected provision ID: {p_id}"
        exp_sec, exp_heading, exp_status = expected_provisions[p_id]

        # Enforce all 8 required schema keys
        assert p.get("provision_name"), f"Missing provision_name for {p_id}"
        assert p.get("status") == exp_status, f"Status mismatch for {p_id}: got {p.get('status')} vs {exp_status}"
        if exp_sec is None:
            assert p.get("actual_section_number") is None, f"Expected None section for {p_id}"
            assert p.get("actual_section_heading") is None, f"Expected None heading for {p_id}"
        else:
            assert str(p.get("actual_section_number")) == exp_sec, f"Section mismatch for {p_id}: got {p.get('actual_section_number')} vs {exp_sec}"
            assert exp_heading in str(p.get("actual_section_heading")), f"Heading mismatch for {p_id}: got {p.get('actual_section_heading')} vs {exp_heading}"
        assert p.get("supporting_text") is not None, f"Missing supporting_text for {p_id}"
        assert p.get("missing_elements") is not None, f"Missing missing_elements for {p_id}"
        assert p.get("commercial_significance"), f"Missing commercial_significance for {p_id}"
        assert p.get("recommendation"), f"Missing recommendation for {p_id}"


def test_preamble_and_schedule_taxonomy():
    """Verify taxonomy: Preamble (STRUCTURAL/INFORMATIONAL), Schedules (SCHEDULE/INFORMATIONAL), Sections 1 & 18 (STRUCTURAL)."""
    res = extract_text(TEST_PDF_PATH, "doc_test", "pdf")
    prep = preprocess_chunks(res.chunks, "doc_test")
    ner = extract_entities(prep.chunks, "doc_test")
    clauses = extract_clauses(prep.chunks, "doc_test", ner.entities)

    by_section = {c.section: c for c in clauses.clauses}

    # Preamble
    preamble = by_section.get("PREAMBLE")
    assert preamble is not None
    assert preamble.clause_type == "preamble"
    assert preamble.section_type == "STRUCTURAL"
    assert preamble.legal_significance == "INFORMATIONAL"

    # Schedule A
    sched_a = by_section.get("SCHEDULE A")
    assert sched_a is not None
    assert sched_a.clause_type == "schedule_doc"
    assert sched_a.section_type == "SCHEDULE"
    assert sched_a.legal_significance == "INFORMATIONAL"
    assert "MILESTONES AND PAYMENT PLAN" in sched_a.clause_name.upper()

    # Schedule B
    sched_b = by_section.get("SCHEDULE B")
    assert sched_b is not None
    assert sched_b.clause_type == "schedule_doc"
    assert sched_b.section_type == "SCHEDULE"
    assert sched_b.legal_significance == "INFORMATIONAL"
    assert "SAMPLE PROJECT ASSUMPTIONS" in sched_b.clause_name.upper()

    # Section 1 & 18
    assert by_section["1"].section_type == "STRUCTURAL"
    assert by_section["18"].section_type == "STRUCTURAL"

    # Section 4: Project Schedule is substantive schedule
    sec4 = by_section["4"]
    assert sec4.section_type == "SUBSTANTIVE"
    assert sec4.clause_type == "schedule"


def test_executive_summary_structural_breakdown():
    """Verify executive summary contains exact structural breakdown phrase."""
    res = extract_text(TEST_PDF_PATH, "doc_test", "pdf")
    prep = preprocess_chunks(res.chunks, "doc_test")
    ner = extract_entities(prep.chunks, "doc_test")
    clauses = extract_clauses(prep.chunks, "doc_test", ner.entities)
    summary = generate_document_summary(
        "doc_test",
        "Business Agreement",
        [c.to_dict() for c in prep.chunks],
        ner.parties,
        ner.dates,
        ner.amounts,
        [c.to_dict() for c in clauses.clauses],
        30,
        "medium",
    )

    expected_phrase = "21 document sections and structural elements identified, including 17 numbered sections, 2 schedules, the preamble, and execution information."
    assert expected_phrase in summary.plain_language_summary, f"Summary did not contain expected structural breakdown: {summary.plain_language_summary}"
    assert "21 distinct legal clauses" not in summary.plain_language_summary


def test_obligation_evidence_and_deadlines():
    """Verify each obligation has supporting evidence, valid section reference, and exact deadline or unspecified."""
    res = extract_text(TEST_PDF_PATH, "doc_test", "pdf")
    prep = preprocess_chunks(res.chunks, "doc_test")
    ner = extract_entities(prep.chunks, "doc_test")
    clauses = extract_clauses(prep.chunks, "doc_test", ner.entities)
    summary = generate_document_summary(
        "doc_test",
        "Business Agreement",
        [c.to_dict() for c in prep.chunks],
        ner.parties,
        ner.dates,
        ner.amounts,
        [c.to_dict() for c in clauses.clauses],
        30,
        "medium",
    )

    assert len(summary.structured_obligations) >= 8
    for o in summary.structured_obligations:
        assert any(p in o.responsible_party for p in ("BrightCode", "Northstar", "PARTIES", "PARTY", "Client", "Provider")), f"Invalid responsible party: {o.responsible_party}"
        assert o.action or o.obligation
        assert o.source_clause
        assert o.supporting_evidence
        assert len(o.supporting_evidence) > 10
        # If deadline is not specified, it must be the exact standard string
        if "not specified" in o.deadline.lower():
            assert o.deadline == "Not specified in the agreement."


def test_cross_report_consistency_validation():
    """Verify cross-report consistency between Risk Analysis, Missing Provisions, and Clauses."""
    res = extract_text(TEST_PDF_PATH, "doc_test", "pdf")
    prep = preprocess_chunks(res.chunks, "doc_test")
    ner = extract_entities(prep.chunks, "doc_test")
    clauses = extract_clauses(prep.chunks, "doc_test", ner.entities)
    missing_eval = evaluate_missing_provisions([c.to_dict() for c in clauses.clauses])
    risk = analyze_document_risk([c.to_dict() for c in clauses.clauses], "doc_test")

    # 1. Check warranty consistency
    w_prov = next(p for p in missing_eval if p["id"] == "post_handover_warranty")
    w_risk = [f for f in risk.findings if "warranty" in f.risk_title.lower() or f.section == "12"]
    assert w_prov["actual_section_number"] == "12"
    for r in w_risk:
        assert r.section == "12"
        assert "30-day" not in r.risk_title.lower()
        assert "30-day" not in r.explanation.lower()

    # 2. Check confidentiality consistency
    c_prov = next(p for p in missing_eval if p["id"] == "confidentiality_survival")
    assert c_prov["actual_section_number"] == "9"
    assert "NOT SPECIFIED" in " ".join(c_prov["missing_elements"])

    # 3. Check dispute resolution jurisdiction (Surat/Gujarat, not Bangalore)
    d_prov = next(p for p in missing_eval if p["id"] == "dispute_resolution_procedure")
    assert "Surat" in d_prov["supporting_text"] or "Gujarat" in d_prov["supporting_text"]
    assert "Bangalore" not in d_prov["supporting_text"]
    assert "Bangalore" not in d_prov["details"]


if __name__ == "__main__":
    tests = [
        test_pdf_extraction_and_chunking,
        test_word_count_and_raw_metrics,
        test_document_classification,
        test_contracting_parties_extraction,
        test_financial_extraction,
        test_date_extraction_filtering,
        test_date_deadline_semantics,
        test_clause_detection_alignment,
        test_section_taxonomy_and_structure,
        test_risk_analysis,
        test_missing_provisions_analysis,
        test_contractual_obligations,
        test_warranty_evidence_and_section_mapping,
        test_confidentiality_survival_semantics,
        test_missing_provisions_all_nine_evidence_schema,
        test_preamble_and_schedule_taxonomy,
        test_executive_summary_structural_breakdown,
        test_obligation_evidence_and_deadlines,
        test_cross_report_consistency_validation,
    ]
    print(f"Running {len(tests)} automated regression tests...")
    passed = 0
    failed = 0
    for t in tests:
        name = t.__name__
        try:
            t()
            print(f"  ✓ {name}: PASSED")
            passed += 1
        except Exception as e:
            import traceback
            print(f"  ✗ {name}: FAILED - {e}")
            traceback.print_exc()
            failed += 1

    print(f"\nResults: {passed} passed, {failed} failed.")
    if failed > 0:
        sys.exit(1)
    print("ALL TESTS PASSED SUCCESSFULLY!")

