import { DAY, startOfDay } from './srs.js';

export function daysLabel(days) {
  if (days < 30) return `${days} 天`;
  if (days < 365) return `${+(days / 30).toFixed(1)} 个月`;
  return `${+(days / 365).toFixed(1)} 年`;
}

export function previewLabel(p) {
  return p.relearn ? '下次优先' : daysLabel(p.days);
}

/** 资料库里显示的“下次复习”时间。 */
export function dueLabel(srs, now, dayStartHour = 4) {
  if (!srs) return '新内容';
  if (srs.due <= now) return '待复习';
  const days = Math.round((startOfDay(srs.due, dayStartHour) - startOfDay(now, dayStartHour)) / DAY);
  if (days <= 0) return '今天稍后';
  if (days === 1) return '明天';
  return `${daysLabel(days)}后`;
}
