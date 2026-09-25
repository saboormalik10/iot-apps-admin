/**
 * No control characters in anything a person names.
 *
 * A name is shown on screen, written into the logs and the audit trail, and
 * folded into an export's file name. QA set a station's name to
 * `Nul\u0000Test\u0007Bell` through the API and it was stored exactly as sent:
 * invisible on screen, and a NUL that every later reader has to strip.
 * (The CSV file-name builder already strips anything but `[A-Za-z0-9._-]`, so
 * nothing reached a response header — this is about not storing it at all.)
 *
 * Printable text and spaces only. Nothing legitimate needs a control character.
 */
export const NO_CONTROL_CHARS = /^[^\u0000-\u001f\u007f]*$/;

export const noControlChars = { message: 'must not contain control characters' };
