// Whether a key press belongs to a form control rather than to the page's shortcuts: anything typed into a text
// field, and on the hour slider the keys that move it (arrows, Home/End, Page Up/Down).
export const typingIn = (e) => {
  const t = e.target;
  if (!t || !t.tagName) return false;
  if (t.isContentEditable || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return true;
  if (t.tagName === 'INPUT') return t.type !== 'range' || /^(Arrow|Home|End|Page)/.test(e.code);
  return false;
};
