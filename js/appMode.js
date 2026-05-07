function getOptionValue() {
  const raw = document.body && document.body.dataset ? document.body.dataset.appOption : '';
  return raw === '2' ? '2' : '1';
}

export function isLeftHighlightEnabled(pageKey) {
  const option = getOptionValue();
  if (option === '1') return pageKey === 'pageBook2';
  return pageKey === 'pageBook1';
}

export function isChatHighlightEnabled(pageKey) {
  const option = getOptionValue();
  if (option === '1') return pageKey === 'pageBook2';
  return pageKey === 'pageBook1';
}
