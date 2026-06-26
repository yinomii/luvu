export type MatchResult = {
  status: 'waiting' | 'matched';
  room_id?: string;
  partner_id?: string;
};

export type ChatMessage = {
  id: string;
  text: string;
  senderId: string;
  createdAt: number;
};

export type SignalPayload = {
  type: 'call-request' | 'call-accept' | 'call-reject' | 'call-end' | 'offer' | 'answer' | 'ice-candidate';
  senderId: string;
  data?: unknown;
};

export type RoomInfo = {
  id: string;
  user_a: string;
  user_b: string;
  status: 'active' | 'ended';
  created_at: string;
};
