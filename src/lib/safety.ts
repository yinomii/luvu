const bannedWords = [
  'sex',
  'nude',
  'địa chỉ nhà',
  'mat khau',
  'mật khẩu',
  'cccd',
  'cmnd'
];

export function normalizeText(text: string) {
  return text.trim().replace(/\s+/g, ' ');
}

export function isTooLong(text: string) {
  return text.length > 500;
}

export function hasUnsafeWord(text: string) {
  const lower = text.toLowerCase();
  return bannedWords.some((word) => lower.includes(word));
}

export function getMessageError(text: string) {
  if (!normalizeText(text)) return 'Tin nhắn đang trống.';
  if (isTooLong(text)) return 'Tin nhắn tối đa 500 ký tự.';
  if (hasUnsafeWord(text)) return 'Tin nhắn có nội dung không an toàn. Hãy sửa lại trước khi gửi.';
  return null;
}

export function canSendMessage(lastSentAt: number) {
  return Date.now() - lastSentAt > 650;
}
