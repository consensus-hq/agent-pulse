export type InboxKey = {
  key: string;
  expiresAt: number;
};

export type InboxTask = {
  id: string;
  receivedAt: number;
  payload: unknown;
};
