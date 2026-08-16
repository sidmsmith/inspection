/** Shared boolean rule engine for criteria-based checklist configs — evaluator + MAWM-syntax preview + field catalog loader. */

const CRITERIA_OPERATORS = [
  { key: 'eq', label: '=' },
  { key: 'ne', label: '≠' },
  { key: 'lt', label: '<' },
  { key: 'lte', label: '<=' },
  { key: 'gt', label: '>' },
  { key: 'gte', label: '>=' },
  { key: 'contains', label: 'CONTAINS' },
  { key: 'starts_with', label: 'STARTS WITH' },
  { key: 'ends_with', label: 'ENDS WITH' },
  { key: 'is_empty', label: 'IS EMPTY' },
  { key: 'is_not_empty', label: 'IS NOT EMPTY' }
];

function criteriaOperatorLabel(key) {
  return CRITERIA_OPERATORS.find(o => o.key === key)?.label || key;
}

function criteriaOperatorTakesValue(key) {
  return key !== 'is_empty' && key !== 'is_not_empty';
}

const criteriaFieldCatalogCache = new Map();

async function loadCriteriaFieldCatalog(objectType) {
  if (criteriaFieldCatalogCache.has(objectType)) return criteriaFieldCatalogCache.get(objectType);
  const promise = fetch(`/config/field-catalog/${encodeURIComponent(objectType)}.json`, { cache: 'no-store' })
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .catch(() => ({ objectType, groups: [] }));
  criteriaFieldCatalogCache.set(objectType, promise);
  return promise;
}

function findCriteriaFieldMeta(catalog, groupKey, fieldPath) {
  const group = catalog?.groups?.find(g => g.key === groupKey);
  return group?.fields?.find(f => f.field === fieldPath) || null;
}

/** Resolve a dotted field path (e.g. "Extended.CPD") against a flat record object. */
function getCriteriaFieldValue(obj, path) {
  if (!obj || !path) return undefined;
  return String(path).split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

function resolveConditionValue(context, condition) {
  const bucket = condition.source === 'item' ? context.item
    : condition.source === 'detail' ? context.detail
    : context.header;
  return getCriteriaFieldValue(bucket, condition.field);
}

function evaluateCriteriaCondition(context, condition) {
  const op = condition?.operator;
  const actual = resolveConditionValue(context, condition);

  if (op === 'is_empty') return actual == null || String(actual).trim() === '';
  if (op === 'is_not_empty') return !(actual == null || String(actual).trim() === '');
  if (actual == null) return false;

  const expected = condition.value;
  const actualNum = Number(actual);
  const expectedNum = Number(expected);
  const bothNumeric = expected !== '' && expected != null && !Number.isNaN(actualNum) && !Number.isNaN(expectedNum);

  switch (op) {
    case 'eq':
      return bothNumeric ? actualNum === expectedNum : String(actual).toLowerCase() === String(expected).toLowerCase();
    case 'ne':
      return bothNumeric ? actualNum !== expectedNum : String(actual).toLowerCase() !== String(expected).toLowerCase();
    case 'lt': return bothNumeric && actualNum < expectedNum;
    case 'lte': return bothNumeric && actualNum <= expectedNum;
    case 'gt': return bothNumeric && actualNum > expectedNum;
    case 'gte': return bothNumeric && actualNum >= expectedNum;
    case 'contains': return String(actual).toLowerCase().includes(String(expected).toLowerCase());
    case 'starts_with': return String(actual).toLowerCase().startsWith(String(expected).toLowerCase());
    case 'ends_with': return String(actual).toLowerCase().endsWith(String(expected).toLowerCase());
    default: return false;
  }
}

/** Flat, ordered AND/OR chain — evaluated strictly left-to-right (no grouping/parentheses). */
function evaluateCriteriaRule(rule, context) {
  const conditions = rule?.conditions;
  if (!Array.isArray(conditions) || conditions.length === 0) return false;
  let result = evaluateCriteriaCondition(context, conditions[0]);
  for (let i = 1; i < conditions.length; i++) {
    const value = evaluateCriteriaCondition(context, conditions[i]);
    result = conditions[i].conjunction === 'OR' ? (result || value) : (result && value);
  }
  return result;
}

/** Walk criteria in priority order (array order), skipping Default, falling back to Default (or last entry). */
function resolveMatchedCriteria(criteriaList, context) {
  const list = Array.isArray(criteriaList) ? criteriaList : [];
  for (const entry of list) {
    if (entry.isDefault) continue;
    if (evaluateCriteriaRule(entry.rule, context)) return entry;
  }
  return list.find(c => c.isDefault) || list[list.length - 1] || null;
}

function mawmValuePattern(operator, value) {
  const v = String(value ?? '');
  if (operator === 'contains') return `%${v}%`;
  if (operator === 'starts_with') return `${v}%`;
  if (operator === 'ends_with') return `%${v}`;
  return v;
}

/** Display-only MAWM-syntax preview for one condition — never executed against MAWM. */
function conditionToMawmSyntax(condition) {
  const field = condition?.field || '…';
  const op = condition?.operator;
  if (op === 'is_empty') return `${field} =''`;
  if (op === 'is_not_empty') return `NOT (${field} ='')`;
  if (op === 'contains' || op === 'starts_with' || op === 'ends_with') {
    return `(${field} _ ${mawmValuePattern(op, condition.value)})`;
  }
  if (op === 'ne') return `NOT (${field} ='${condition.value ?? ''}')`;
  if (op === 'eq') return `${field} ='${condition.value ?? ''}'`;
  const opLabel = { lt: '<', lte: '<=', gt: '>', gte: '>=' }[op] || '=';
  return `${field} ${opLabel} ${condition.value ?? ''}`;
}

function ruleToMawmSyntax(rule) {
  const conditions = rule?.conditions;
  if (!Array.isArray(conditions) || conditions.length === 0) return '';
  return conditions
    .map((c, i) => (i === 0 ? conditionToMawmSyntax(c) : `${c.conjunction || 'AND'} ${conditionToMawmSyntax(c)}`))
    .join(' ');
}

function newCriteriaConditionId() {
  return `cond-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function newCriteriaId() {
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
