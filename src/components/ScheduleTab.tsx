import { useState, useEffect, useCallback } from 'react';
import type { AutoSchedule, TimeSlot } from '../types';
import {
  loadScheduleLocal,
  syncScheduleFromGitHub,
  updateScheduleOnGitHub,
  toggleSlot as toggleSlotUtil,
} from '../utils/autoSchedule';
import { Spinner } from './Spinner';

const TIME_SLOTS: TimeSlot[] = ['06:00', '12:00', '18:00', '24:00'];
const DAYS_JP = ['日', '月', '火', '水', '木', '金', '土'];
const DAYS_FULL = ['日曜', '月曜', '火曜', '水曜', '木曜', '金曜', '土曜'];

interface Props {
  onToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getMonthDays(year: number, month: number): Date[] {
  const days: Date[] = [];
  const d = new Date(year, month, 1);
  while (d.getMonth() === month) {
    days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

function getWeekStart(baseDate: Date, weekOffset: number): Date {
  const d = new Date(baseDate);
  const dow = d.getDay(); // 0=Sun
  // Start from Sunday
  d.setDate(d.getDate() - dow + weekOffset * 7);
  return d;
}

function getSlotStatus(
  schedule: AutoSchedule,
  date: string,
  time: TimeSlot
): 'posted' | 'enabled' | 'off' {
  const slot = schedule.slots.find((s) => s.date === date && s.time === time);
  if (slot?.posted) return 'posted';
  if (slot?.enabled) return 'enabled';
  return 'off';
}

// ---------- Bulk Settings Modal ----------
interface BulkModalProps {
  year: number;
  month: number;
  schedule: AutoSchedule;
  onApply: (schedule: AutoSchedule) => Promise<void>;
  onClose: () => void;
}

function BulkModal({ year, month, schedule, onApply, onClose }: BulkModalProps) {
  const [dayType, setDayType] = useState<'everyday' | 'weekday' | 'weekend' | 'custom'>('everyday');
  const [customDays, setCustomDays] = useState<boolean[]>([true, true, true, true, true, true, true]);
  const [selectedTimes, setSelectedTimes] = useState<boolean[]>([false, false, false, false]);
  const [turnOn, setTurnOn] = useState(true);
  const [applying, setApplying] = useState(false);

  const toggleCustomDay = (i: number) =>
    setCustomDays((d) => d.map((v, idx) => (idx === i ? !v : v)));

  const toggleTime = (i: number) =>
    setSelectedTimes((t) => t.map((v, idx) => (idx === i ? !v : v)));

  const getActiveDayIndices = (): number[] => {
    if (dayType === 'everyday') return [0, 1, 2, 3, 4, 5, 6];
    if (dayType === 'weekday') return [1, 2, 3, 4, 5];
    if (dayType === 'weekend') return [0, 6];
    return customDays.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
  };

  const handleApply = async () => {
    const activeDays = getActiveDayIndices();
    const activeTimes = TIME_SLOTS.filter((_, i) => selectedTimes[i]);
    if (activeTimes.length === 0) return;

    setApplying(true);
    const monthDays = getMonthDays(year, month);
    let newSlots = [...schedule.slots];

    for (const d of monthDays) {
      if (!activeDays.includes(d.getDay())) continue;
      const dateStr = formatDate(d);
      for (const time of activeTimes) {
        const existing = newSlots.find((s) => s.date === dateStr && s.time === time);
        if (existing?.posted) continue; // skip posted
        if (turnOn) {
          if (!existing) {
            newSlots.push({ date: dateStr, time, enabled: true });
          } else if (!existing.enabled) {
            newSlots = newSlots.map((s) =>
              s.date === dateStr && s.time === time ? { ...s, enabled: true } : s
            );
          }
        } else {
          // turn OFF: remove non-posted slots
          newSlots = newSlots.filter(
            (s) => !(s.date === dateStr && s.time === time && !s.posted)
          );
        }
      }
    }

    await onApply({ ...schedule, slots: newSlots });
    setApplying(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal bulk-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal__title">一括設定</h3>

        <div className="bulk-section">
          <p className="bulk-label">曜日</p>
          <div className="bulk-day-types">
            {(['everyday', 'weekday', 'weekend', 'custom'] as const).map((t) => (
              <button
                key={t}
                className={`bulk-day-btn ${dayType === t ? 'bulk-day-btn--active' : ''}`}
                onClick={() => setDayType(t)}
              >
                {{ everyday: '毎日', weekday: '平日', weekend: '週末', custom: '曜日選択' }[t]}
              </button>
            ))}
          </div>
          {dayType === 'custom' && (
            <div className="bulk-custom-days">
              {DAYS_FULL.map((label, i) => (
                <label key={i} className="bulk-checkbox">
                  <input
                    type="checkbox"
                    checked={customDays[i]}
                    onChange={() => toggleCustomDay(i)}
                  />
                  {label}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="bulk-section">
          <p className="bulk-label">時間帯</p>
          <div className="bulk-times">
            {TIME_SLOTS.map((time, i) => (
              <label key={time} className="bulk-checkbox">
                <input
                  type="checkbox"
                  checked={selectedTimes[i]}
                  onChange={() => toggleTime(i)}
                />
                {time}
              </label>
            ))}
          </div>
        </div>

        <div className="bulk-section">
          <p className="bulk-label">操作</p>
          <div className="bulk-toggle">
            <button
              className={`bulk-op-btn ${turnOn ? 'bulk-op-btn--on' : ''}`}
              onClick={() => setTurnOn(true)}
            >
              ● ON にする
            </button>
            <button
              className={`bulk-op-btn ${!turnOn ? 'bulk-op-btn--off' : ''}`}
              onClick={() => setTurnOn(false)}
            >
              ○ OFF にする
            </button>
          </div>
        </div>

        <div className="modal__actions">
          <button className="btn btn--ghost" onClick={onClose} disabled={applying}>
            キャンセル
          </button>
          <button
            className="btn btn--primary"
            onClick={handleApply}
            disabled={applying || selectedTimes.every((v) => !v)}
          >
            {applying ? '保存中...' : '適用'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Main ScheduleTab ----------
export function ScheduleTab({ onToast }: Props) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [schedule, setSchedule] = useState<AutoSchedule>(loadScheduleLocal);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 640);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    setSyncing(true);
    syncScheduleFromGitHub()
      .then((s) => { if (s) setSchedule(s); })
      .finally(() => setSyncing(false));
  }, []);

  const saveSchedule = useCallback(
    async (newSchedule: AutoSchedule) => {
      setSaving(true);
      try {
        await updateScheduleOnGitHub(newSchedule);
      } catch (e) {
        onToast(e instanceof Error ? e.message : '保存に失敗しました', 'error');
        throw e;
      } finally {
        setSaving(false);
      }
    },
    [onToast]
  );

  const handleToggle = useCallback(
    async (date: string, time: TimeSlot) => {
      const newSchedule = toggleSlotUtil(schedule, date, time);
      if (newSchedule === schedule) return; // posted slot, no change
      setSchedule(newSchedule);
      try {
        await saveSchedule(newSchedule);
      } catch {
        setSchedule(schedule); // revert on error
      }
    },
    [schedule, saveSchedule]
  );

  const handleBulkApply = useCallback(
    async (newSchedule: AutoSchedule) => {
      setSchedule(newSchedule);
      try {
        await saveSchedule(newSchedule);
        onToast('一括設定を保存しました', 'success');
        setShowBulk(false);
      } catch {
        setSchedule(schedule); // revert on error
      }
    },
    [schedule, saveSchedule, onToast]
  );

  const prevMonth = () => {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); }
    else setMonth((m) => m - 1);
  };

  const nextMonth = () => {
    if (month === 11) { setYear((y) => y + 1); setMonth(0); }
    else setMonth((m) => m + 1);
  };

  const enabledCount = schedule.slots.filter((s) => {
    const d = new Date(s.date + 'T00:00:00');
    return d.getFullYear() === year && d.getMonth() === month && s.enabled && !s.posted;
  }).length;

  const postedCount = schedule.slots.filter((s) => {
    const d = new Date(s.date + 'T00:00:00');
    return d.getFullYear() === year && d.getMonth() === month && s.posted;
  }).length;

  const todayStr = formatDate(today);

  if (syncing) return <Spinner />;

  return (
    <div className="tab-content schedule-tab">
      {/* Header */}
      <div className="schedule-header">
        <div className="schedule-nav">
          <button className="btn btn--ghost schedule-nav-btn" onClick={prevMonth}>‹</button>
          <h2 className="schedule-month-title">{year}年{month + 1}月</h2>
          <button className="btn btn--ghost schedule-nav-btn" onClick={nextMonth}>›</button>
        </div>
        <button className="btn btn--secondary btn--sm" onClick={() => setShowBulk(true)}>
          一括設定
        </button>
      </div>

      {/* Stats & Legend */}
      <div className="schedule-meta">
        <div className="schedule-stats">
          <span className="stat stat--enabled">● {enabledCount}件予定</span>
          <span className="stat stat--posted">✓ {postedCount}件投稿済</span>
          {saving && <span className="stat stat--saving">保存中...</span>}
        </div>
        <div className="schedule-legend">
          <span className="leg"><span className="leg-dot leg-dot--enabled">●</span>予定</span>
          <span className="leg"><span className="leg-dot leg-dot--posted">✓</span>済</span>
          <span className="leg"><span className="leg-dot leg-dot--off">○</span>OFF</span>
        </div>
      </div>

      {isMobile ? (
        // ---- Week view (mobile) ----
        <div className="week-view">
          <div className="week-nav">
            <button className="btn btn--ghost btn--sm" onClick={() => setWeekOffset((w) => w - 1)}>
              ‹ 前週
            </button>
            <button
              className="btn btn--ghost btn--sm"
              onClick={() => setWeekOffset(0)}
              disabled={weekOffset === 0}
            >
              今週
            </button>
            <button className="btn btn--ghost btn--sm" onClick={() => setWeekOffset((w) => w + 1)}>
              翌週 ›
            </button>
          </div>
          <div className="week-days">
            {Array.from({ length: 7 }).map((_, i) => {
              const d = new Date(getWeekStart(today, weekOffset));
              d.setDate(d.getDate() + i);
              const dateStr = formatDate(d);
              const isToday = dateStr === todayStr;
              return (
                <div key={dateStr} className={`week-day ${isToday ? 'week-day--today' : ''}`}>
                  <div className="week-day-label">
                    <span className={`week-dow week-dow--${d.getDay()}`}>{DAYS_JP[d.getDay()]}</span>
                    <span className="week-date">{d.getMonth() + 1}/{d.getDate()}</span>
                  </div>
                  <div className="week-slots">
                    {TIME_SLOTS.map((time) => {
                      const status = getSlotStatus(schedule, dateStr, time);
                      return (
                        <button
                          key={time}
                          className={`wslot wslot--${status}`}
                          onClick={() => handleToggle(dateStr, time)}
                          disabled={status === 'posted' || saving}
                        >
                          <span className="wslot-dot">
                            {status === 'posted' ? '✓' : status === 'enabled' ? '●' : '○'}
                          </span>
                          <span className="wslot-time">{time}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        // ---- Month calendar (desktop) ----
        <div className="cal">
          <div className="cal-weekdays">
            {DAYS_JP.map((d, i) => (
              <div key={i} className={`cal-wd cal-wd--${i}`}>{d}</div>
            ))}
          </div>
          <div className="cal-grid">
            {/* offset for first day of month */}
            {Array.from({ length: new Date(year, month, 1).getDay() }).map((_, i) => (
              <div key={`empty-${i}`} className="cal-cell cal-cell--empty" />
            ))}
            {getMonthDays(year, month).map((d) => {
              const dateStr = formatDate(d);
              const isToday = dateStr === todayStr;
              return (
                <div key={dateStr} className={`cal-cell ${isToday ? 'cal-cell--today' : ''}`}>
                  <div className="cal-cell-num">{d.getDate()}</div>
                  <div className="cal-cell-slots">
                    {TIME_SLOTS.map((time) => {
                      const status = getSlotStatus(schedule, dateStr, time);
                      return (
                        <button
                          key={time}
                          className={`cslot cslot--${status}`}
                          onClick={() => handleToggle(dateStr, time)}
                          disabled={status === 'posted' || saving}
                          title={`${time} ${status === 'posted' ? '投稿済' : status === 'enabled' ? '投稿予定' : 'OFF'}`}
                        >
                          <span className="cslot-dot">
                            {status === 'posted' ? '✓' : status === 'enabled' ? '●' : '○'}
                          </span>
                          <span className="cslot-time">{time.slice(0, 2)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showBulk && (
        <BulkModal
          year={year}
          month={month}
          schedule={schedule}
          onApply={handleBulkApply}
          onClose={() => setShowBulk(false)}
        />
      )}
    </div>
  );
}
