// ============================================================
// LegalMind AI — Diff & Comparison Helper
// Computes authentic word-level and clause-level comparisons
// No simulated or fabricated data
// ============================================================

/**
 * Tokenizes text into words and whitespace/punctuation tokens
 */
function tokenize(text) {
  if (!text) return [];
  // Match sequences of non-whitespace or whitespace
  return text.match(/\S+|\s+/g) || [];
}

/**
 * Longest Common Subsequence algorithm on token arrays
 */
function computeLCS(tokensA, tokensB) {
  const m = tokensA.length;
  const n = tokensB.length;
  
  // Guard against extreme sizes for performance
  if (m * n > 4000000) {
    // Fallback line-by-line for very large documents
    return null;
  }

  const dp = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1));

  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      if (tokensA[i] === tokensB[j]) {
        dp[i + 1][j + 1] = dp[i][j] + 1;
      } else {
        dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  // Backtrack to find LCS
  const chunks = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && tokensA[i - 1] === tokensB[j - 1]) {
      chunks.unshift({ type: 'unchanged', value: tokensA[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      chunks.unshift({ type: 'added', value: tokensB[j - 1] });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      chunks.unshift({ type: 'removed', value: tokensA[i - 1] });
      i--;
    }
  }

  // Collapse consecutive tokens of the same type
  const collapsed = [];
  for (const chunk of chunks) {
    if (collapsed.length > 0 && collapsed[collapsed.length - 1].type === chunk.type) {
      collapsed[collapsed.length - 1].value += chunk.value;
    } else {
      collapsed.push({ type: chunk.type, value: chunk.value });
    }
  }

  return collapsed;
}

/**
 * Word-level diff
 */
function computeWordDiff(textA, textB) {
  if (textA === textB) {
    return {
      chunks: [{ type: 'unchanged', value: textA || '' }],
      addedCount: 0,
      removedCount: 0,
      identical: true,
    };
  }

  const tokensA = tokenize(textA || '');
  const tokensB = tokenize(textB || '');

  let chunks = computeLCS(tokensA, tokensB);

  // If text was too large for LCS matrix, fallback to line diff
  if (!chunks) {
    const linesA = (textA || '').split('\n');
    const linesB = (textB || '').split('\n');
    const setB = new Set(linesB);
    const setA = new Set(linesA);

    chunks = [];
    for (const l of linesA) {
      if (!setB.has(l)) chunks.push({ type: 'removed', value: l + '\n' });
      else chunks.push({ type: 'unchanged', value: l + '\n' });
    }
    for (const l of linesB) {
      if (!setA.has(l)) chunks.push({ type: 'added', value: l + '\n' });
    }
  }

  let addedCount = 0;
  let removedCount = 0;

  for (const c of chunks) {
    if (c.type === 'added') addedCount += tokenize(c.value).filter(t => /\S/.test(t)).length;
    if (c.type === 'removed') removedCount += tokenize(c.value).filter(t => /\S/.test(t)).length;
  }

  return {
    chunks,
    addedCount,
    removedCount,
    identical: addedCount === 0 && removedCount === 0,
  };
}

/**
 * Compare clauses between Base and Target documents
 */
function compareClauses(clausesA = [], clausesB = [], riskFindingsA = [], riskFindingsB = []) {
  const flaggedA = new Map();
  for (const f of riskFindingsA) {
    if (f.clauseType) flaggedA.set(f.clauseType.toLowerCase(), f);
  }

  const flaggedB = new Map();
  for (const f of riskFindingsB) {
    if (f.clauseType) flaggedB.set(f.clauseType.toLowerCase(), f);
  }

  const results = [];
  const matchedBIndices = new Set();

  // 1. Process clauses in A
  clausesA.forEach((clauseA, idxA) => {
    const typeA = (clauseA.clauseType || clauseA.type || '').toLowerCase();
    const textA = clauseA.clauseText || clauseA.text || '';

    // Find best match in B: same type first
    let matchIdxB = -1;
    for (let idxB = 0; idxB < clausesB.length; idxB++) {
      if (matchedBIndices.has(idxB)) continue;
      const typeB = (clausesB[idxB].clauseType || clausesB[idxB].type || '').toLowerCase();
      if (typeA && typeA === typeB) {
        matchIdxB = idxB;
        break;
      }
    }

    // Risk details
    const riskA = flaggedA.get(typeA) || null;

    if (matchIdxB !== -1) {
      matchedBIndices.add(matchIdxB);
      const clauseB = clausesB[matchIdxB];
      const textB = clauseB.clauseText || clauseB.text || '';
      const riskB = flaggedB.get(typeA) || null;

      const diff = computeWordDiff(textA, textB);
      const isIdentical = diff.identical;

      // Determine significance based ONLY on authentic risk / classification data
      let significanceExplanation = null;
      let hasRiskDelta = false;

      if (riskA && !riskB) {
        significanceExplanation = `Risk alleviated: Base version flagged this ${typeA} clause as ${riskA.riskLevel.toUpperCase()} risk ("${riskA.reason}"). Target version revision is no longer flagged.`;
        hasRiskDelta = true;
      } else if (!riskA && riskB) {
        significanceExplanation = `New risk identified: Target version's revised wording introduces ${riskB.riskLevel.toUpperCase()} risk ("${riskB.reason}").`;
        hasRiskDelta = true;
      } else if (riskA && riskB) {
        if (riskA.riskLevel !== riskB.riskLevel || riskA.riskScore !== riskB.riskScore) {
          significanceExplanation = `Risk rating shifted from ${riskA.riskLevel.toUpperCase()} (${riskA.riskScore} pts) to ${riskB.riskLevel.toUpperCase()} (${riskB.riskScore} pts): ${riskB.reason}`;
          hasRiskDelta = true;
        } else if (!isIdentical) {
          significanceExplanation = `Text modified; risk level remains ${riskA.riskLevel.toUpperCase()} ("${riskA.reason}").`;
        }
      } else if (!isIdentical) {
        significanceExplanation = 'Contractual wording modified. No model-flagged compliance or liability risks detected in either version.';
      }

      results.push({
        id: `clause_mod_${idxA}_${matchIdxB}`,
        status: isIdentical ? 'unchanged' : 'modified',
        clauseType: clauseA.clauseType || clauseB.clauseType || 'Clause',
        sectionBase: clauseA.section || null,
        sectionTarget: clauseB.section || null,
        pageBase: clauseA.page || null,
        pageTarget: clauseB.page || null,
        baseText: textA,
        targetText: textB,
        diff: diff.chunks,
        addedWords: diff.addedCount,
        removedWords: diff.removedCount,
        baseRisk: riskA ? { level: riskA.riskLevel, score: riskA.riskScore, reason: riskA.reason } : null,
        targetRisk: riskB ? { level: riskB.riskLevel, score: riskB.riskScore, reason: riskB.reason } : null,
        significanceExplanation,
        hasRiskDelta,
      });
    } else {
      // Removed in B
      const wasRisk = flaggedA.get(typeA);
      results.push({
        id: `clause_rem_${idxA}`,
        status: 'removed',
        clauseType: clauseA.clauseType || 'Clause',
        sectionBase: clauseA.section || null,
        sectionTarget: null,
        pageBase: clauseA.page || null,
        pageTarget: null,
        baseText: textA,
        targetText: null,
        diff: [{ type: 'removed', value: textA }],
        addedWords: 0,
        removedWords: tokenize(textA).filter(t => /\S/.test(t)).length,
        baseRisk: wasRisk ? { level: wasRisk.riskLevel, score: wasRisk.riskScore, reason: wasRisk.reason } : null,
        targetRisk: null,
        significanceExplanation: wasRisk
          ? `Clause omitted in target version: Removed a clause previously flagged for ${wasRisk.riskLevel.toUpperCase()} risk ("${wasRisk.reason}").`
          : 'Clause omitted in target version. Did not carry flagged risk in base version.',
        hasRiskDelta: !!wasRisk,
      });
    }
  });

  // 2. Added clauses in B that weren't in A
  clausesB.forEach((clauseB, idxB) => {
    if (matchedBIndices.has(idxB)) return;

    const typeB = (clauseB.clauseType || clauseB.type || '').toLowerCase();
    const textB = clauseB.clauseText || clauseB.text || '';
    const riskB = flaggedB.get(typeB) || null;

    results.push({
      id: `clause_add_${idxB}`,
      status: 'added',
      clauseType: clauseB.clauseType || 'Clause',
      sectionBase: null,
      sectionTarget: clauseB.section || null,
      pageBase: null,
      pageTarget: clauseB.page || null,
      baseText: null,
      targetText: textB,
      diff: [{ type: 'added', value: textB }],
      addedWords: tokenize(textB).filter(t => /\S/.test(t)).length,
      removedWords: 0,
      baseRisk: null,
      targetRisk: riskB ? { level: riskB.riskLevel, score: riskB.riskScore, reason: riskB.reason } : null,
      significanceExplanation: riskB
        ? `New clause added in target version with ${riskB.riskLevel.toUpperCase()} risk: "${riskB.reason}".`
        : 'New clause introduced in target version. No statutory risk flagged by model.',
      hasRiskDelta: !!riskB,
    });
  });

  return results;
}

module.exports = {
  tokenize,
  computeWordDiff,
  compareClauses,
};
