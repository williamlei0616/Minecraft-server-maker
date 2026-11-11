// Turns core's validation problem (a code plus parameters) into a sentence in the page's language.
import type { PropertyIssue, ValidationDetail } from '@/core';
import type { Messages } from '@/i18n';
import { fmt } from '@/i18n/format';

export function errorText(
  detail: ValidationDetail | undefined,
  fallback: string,
  m: Messages,
): string {
  if (!detail) return fallback;
  const e = m.errors;
  switch (detail.code) {
    case 'version':
      return e.version;
    case 'choice':
      return e.choice;
    case 'onoff':
      return e.onoff;
    case 'blank':
      return e.blank;
    case 'username':
      return e.username;
    case 'range':
      return fmt(e.range, { min: detail.min ?? '', max: detail.max ?? '' });
    case 'tooLong':
      return fmt(e.tooLong, { max: detail.max ?? '' });
    case 'listName':
      return fmt(e.listName, { value: detail.value ?? '' });
    case 'listTooMany':
      return fmt(e.listTooMany, { max: detail.max ?? '' });
    case 'listDuplicate':
      return fmt(e.listDuplicate, { value: detail.value ?? '' });
    case 'listOverlap':
      return fmt(e.listOverlap, { value: detail.value ?? '' });
    case 'blockOwner':
      return e.blockOwner;
    case 'ipInvalid':
      return fmt(e.ipInvalid, { value: detail.value ?? '' });
    case 'whitelistEmpty':
      return e.whitelistEmpty;
    case 'mapName':
      return fmt(e.mapName, { value: detail.value ?? '' });
    case 'extraKey':
      return fmt(e.extraKey, { value: detail.value ?? '' });
    case 'extraValue':
      return fmt(e.extraValue, { value: detail.value ?? '' });
    case 'extraTooMany':
      return fmt(e.extraTooMany, { max: detail.max ?? '' });
    default:
      return fallback;
  }
}

/** One editor problem or warning as a sentence in the page's language. */
export function issueText(issue: PropertyIssue, m: Messages): string {
  return fmt(m.editor.issues[issue.code], {
    key: issue.key,
    min: issue.min ?? '',
    max: issue.max ?? '',
    options: (issue.options ?? []).join(', '),
  });
}
