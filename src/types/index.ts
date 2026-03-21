export type Genre = 'writer' | 'fire';

export type TimeSlot = '06:00' | '12:00' | '18:00' | '24:00';

export interface ScheduleSlot {
  date: string;      // 'YYYY-MM-DD'
  time: TimeSlot;
  enabled: boolean;
  posted?: boolean;
}

export interface AutoSchedule {
  slots: ScheduleSlot[];
  defaultTimes: TimeSlot[];
}

export interface Tweet {
  id: string;
  text: string;
  tags: string[];
}

export interface ScheduledTweet {
  id: string;
  text: string;
  tags: string[];
  scheduledAt?: string; // ISO 8601
  immediate?: boolean;
  posted?: boolean;
  createdAt: string;
}
