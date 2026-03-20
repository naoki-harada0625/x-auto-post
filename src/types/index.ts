export type Genre = 'writer' | 'fire';

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
