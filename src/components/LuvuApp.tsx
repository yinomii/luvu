'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import type { RealtimeChannel, User } from '@supabase/supabase-js';
import {
  Ban,
  Flag,
  Heart,
  Loader2,
  Mic,
  MicOff,
  Phone,
  PhoneCall,
  PhoneOff,
  RefreshCcw,
  Send,
  ShieldAlert,
  Sparkles,
  UserRound,
  X
} from 'lucide-react';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { canSendMessage, getMessageError, normalizeText } from '@/lib/safety';
import type { ChatMessage, MatchResult, RoomInfo, SignalPayload } from '@/lib/types';

type AppStatus = 'booting' | 'setup-error' | 'idle' | 'matching' | 'waiting' | 'chat';
type CallStatus = 'idle' | 'calling' | 'ringing' | 'connecting' | 'in-call';

type SignalData = RTCSessionDescriptionInit | RTCIceCandidateInit | null;

const DISPLAY_NAME = 'Người lạ';
const STUN_SERVERS: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

function uid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function compactId(id?: string | null) {
  if (!id) return 'ẩn danh';
  return id.slice(0, 4).toUpperCase();
}

export default function LuvuApp() {
  const [status, setStatus] = useState<AppStatus>('booting');
  const [setupError, setSetupError] = useState<string>('');
  const [user, setUser] = useState<User | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [notice, setNotice] = useState('');
  const [lastSentAt, setLastSentAt] = useState(0);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('spam');
  const [callStatus, setCallStatus] = useState<CallStatus>('idle');
  const [micEnabled, setMicEnabled] = useState(true);
  const [hasRemoteAudio, setHasRemoteAudio] = useState(false);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const roomIdRef = useRef<string | null>(null);
  const partnerIdRef = useRef<string | null>(null);
  const userIdRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const waitingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const userId = user?.id ?? null;

  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  useEffect(() => {
    roomIdRef.current = roomId;
  }, [roomId]);

  useEffect(() => {
    partnerIdRef.current = partnerId;
  }, [partnerId]);

  const partnerShortId = useMemo(() => compactId(partnerId), [partnerId]);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }));
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const showNotice = useCallback((text: string) => {
    setNotice(text);
    window.setTimeout(() => setNotice(''), 2600);
  }, []);

  const stopWaitingTimer = useCallback(() => {
    if (waitingTimerRef.current) {
      clearInterval(waitingTimerRef.current);
      waitingTimerRef.current = null;
    }
  }, []);

  const detachRoomChannel = useCallback(async () => {
    if (channelRef.current && supabase) {
      const channel = channelRef.current;
      channelRef.current = null;
      await supabase.removeChannel(channel);
    }
  }, []);

  const sendSignal = useCallback(async (type: SignalPayload['type'], data?: SignalData) => {
    const channel = channelRef.current;
    const senderId = userIdRef.current;
    if (!channel || !senderId) return;

    await channel.send({
      type: 'broadcast',
      event: 'signal',
      payload: {
        type,
        senderId,
        data: data ?? null
      } satisfies SignalPayload
    });
  }, []);

  const resetCall = useCallback((notifyPartner = false) => {
    if (notifyPartner) void sendSignal('call-end');

    if (pcRef.current) {
      pcRef.current.ontrack = null;
      pcRef.current.onicecandidate = null;
      pcRef.current.close();
      pcRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    pendingIceRef.current = [];
    setHasRemoteAudio(false);
    setMicEnabled(true);
    setCallStatus('idle');
  }, [sendSignal]);

  const ensurePeer = useCallback(async () => {
    if (pcRef.current) return pcRef.current;

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Trình duyệt này chưa hỗ trợ gọi thoại. Hãy thử Chrome/Safari mới hơn.');
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    localStreamRef.current = stream;

    const pc = new RTCPeerConnection(STUN_SERVERS);
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    pc.onicecandidate = (event) => {
      if (event.candidate) void sendSignal('ice-candidate', event.candidate.toJSON());
    };

    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      if (remoteAudioRef.current && remoteStream) {
        remoteAudioRef.current.srcObject = remoteStream;
        void remoteAudioRef.current.play().catch(() => undefined);
        setHasRemoteAudio(true);
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        showNotice('Cuộc gọi bị ngắt. Có thể mạng của một trong hai bên chưa ổn.');
        resetCall(false);
      }
    };

    pcRef.current = pc;
    return pc;
  }, [resetCall, sendSignal, showNotice]);

  const flushPendingIce = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc?.remoteDescription) return;

    const queue = pendingIceRef.current.splice(0);
    for (const candidate of queue) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch {
        // Candidate can fail on some network conditions; keep the call alive if possible.
      }
    }
  }, []);

  const handleSignal = useCallback(async (payload: SignalPayload) => {
    if (!payload || payload.senderId === userIdRef.current) return;

    try {
      if (payload.type === 'call-request') {
        setCallStatus('ringing');
        showNotice('Người lạ đang gọi cho bạn.');
        return;
      }

      if (payload.type === 'call-reject') {
        showNotice('Người lạ đã từ chối cuộc gọi.');
        resetCall(false);
        return;
      }

      if (payload.type === 'call-end') {
        showNotice('Cuộc gọi đã kết thúc.');
        resetCall(false);
        return;
      }

      if (payload.type === 'call-accept') {
        setCallStatus('connecting');
        const pc = await ensurePeer();
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await sendSignal('offer', offer);
        setCallStatus('in-call');
        return;
      }

      if (payload.type === 'offer') {
        setCallStatus('connecting');
        const pc = await ensurePeer();
        await pc.setRemoteDescription(new RTCSessionDescription(payload.data as RTCSessionDescriptionInit));
        await flushPendingIce();
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await sendSignal('answer', answer);
        setCallStatus('in-call');
        return;
      }

      if (payload.type === 'answer') {
        const pc = pcRef.current;
        if (!pc) return;
        await pc.setRemoteDescription(new RTCSessionDescription(payload.data as RTCSessionDescriptionInit));
        await flushPendingIce();
        setCallStatus('in-call');
        return;
      }

      if (payload.type === 'ice-candidate') {
        const candidate = payload.data as RTCIceCandidateInit;
        const pc = pcRef.current;
        if (!pc?.remoteDescription) {
          pendingIceRef.current.push(candidate);
          return;
        }
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Không thể kết nối cuộc gọi.';
      showNotice(message);
      resetCall(true);
    }
  }, [ensurePeer, flushPendingIce, resetCall, sendSignal, showNotice]);

  const attachRoomChannel = useCallback(async (nextRoomId: string) => {
    if (!supabase || !userIdRef.current) return;
    await detachRoomChannel();

    const channel = supabase.channel(`luvu-room-${nextRoomId}`, {
      config: {
        broadcast: { self: false, ack: true },
        presence: { key: userIdRef.current }
      }
    });

    channel
      .on('broadcast', { event: 'message' }, ({ payload }) => {
        const message = payload as ChatMessage;
        setMessages((current) => [...current, message]);
      })
      .on('broadcast', { event: 'system' }, ({ payload }) => {
        const text = (payload as { text?: string })?.text;
        if (text) showNotice(text);
      })
      .on('broadcast', { event: 'signal' }, ({ payload }) => {
        void handleSignal(payload as SignalPayload);
      })
      .subscribe(async (subStatus) => {
        if (subStatus === 'SUBSCRIBED') {
          await channel.track({ online_at: new Date().toISOString() });
        }
      });

    channelRef.current = channel;
  }, [detachRoomChannel, handleSignal, showNotice]);

  const enterRoom = useCallback(async (match: MatchResult) => {
    if (!match.room_id || !match.partner_id) return;
    stopWaitingTimer();
    resetCall(false);
    setMessages([]);
    setRoomId(match.room_id);
    setPartnerId(match.partner_id);
    setStatus('chat');
    await attachRoomChannel(match.room_id);
    showNotice('Đã ghép đôi với một người lạ.');
  }, [attachRoomChannel, resetCall, showNotice, stopWaitingTimer]);

  const checkActiveRoom = useCallback(async () => {
    if (!supabase || !userIdRef.current) return;

    const { data, error } = await supabase
      .from('rooms')
      .select('id,user_a,user_b,status,created_at')
      .eq('status', 'active')
      .or(`user_a.eq.${userIdRef.current},user_b.eq.${userIdRef.current}`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      showNotice(error.message);
      return;
    }

    const room = data as RoomInfo | null;
    if (room) {
      const nextPartner = room.user_a === userIdRef.current ? room.user_b : room.user_a;
      await enterRoom({ status: 'matched', room_id: room.id, partner_id: nextPartner });
    }
  }, [enterRoom, showNotice]);

  const startWaitingPoll = useCallback(() => {
    stopWaitingTimer();
    waitingTimerRef.current = setInterval(() => {
      void checkActiveRoom();
    }, 1400);
  }, [checkActiveRoom, stopWaitingTimer]);

  const startMatching = useCallback(async () => {
    if (!supabase) {
      setStatus('setup-error');
      setSetupError('Thiếu biến môi trường Supabase.');
      return;
    }

    if (!userIdRef.current) {
      showNotice('Đang tạo phiên ẩn danh, thử lại sau vài giây.');
      return;
    }

    resetCall(true);
    await detachRoomChannel();
    stopWaitingTimer();
    setMessages([]);
    setRoomId(null);
    setPartnerId(null);
    setStatus('matching');

    const { data, error } = await supabase.rpc('match_random_user');

    if (error) {
      setStatus('idle');
      showNotice(error.message);
      return;
    }

    const result = data as MatchResult;
    if (result.status === 'matched') {
      await enterRoom(result);
      return;
    }

    setStatus('waiting');
    startWaitingPoll();
  }, [detachRoomChannel, enterRoom, resetCall, showNotice, startWaitingPoll, stopWaitingTimer]);

  const leaveRoom = useCallback(async (goIdle = true) => {
    if (!supabase) return;
    stopWaitingTimer();

    const currentRoom = roomIdRef.current;
    if (currentRoom && channelRef.current) {
      await channelRef.current.send({
        type: 'broadcast',
        event: 'system',
        payload: { text: 'Người lạ đã rời phòng.' }
      });
    }

    resetCall(true);
    await detachRoomChannel();

    if (currentRoom) {
      await supabase.rpc('leave_room', { p_room_id: currentRoom });
    } else {
      await supabase.rpc('cancel_waiting');
    }

    setMessages([]);
    setRoomId(null);
    setPartnerId(null);
    if (goIdle) setStatus('idle');
  }, [detachRoomChannel, resetCall, stopWaitingTimer]);

  const findNext = useCallback(async () => {
    await leaveRoom(false);
    await startMatching();
  }, [leaveRoom, startMatching]);

  const sendMessage = useCallback(async (event: FormEvent) => {
    event.preventDefault();
    if (!channelRef.current || !userIdRef.current) return;

    const text = normalizeText(input);
    const error = getMessageError(text);
    if (error) {
      showNotice(error);
      return;
    }

    if (!canSendMessage(lastSentAt)) {
      showNotice('Gửi chậm lại một chút để tránh spam.');
      return;
    }

    const message: ChatMessage = {
      id: uid(),
      text,
      senderId: userIdRef.current,
      createdAt: Date.now()
    };

    setInput('');
    setLastSentAt(Date.now());
    setMessages((current) => [...current, message]);

    const result = await channelRef.current.send({
      type: 'broadcast',
      event: 'message',
      payload: message
    });

    if (result !== 'ok') showNotice('Tin nhắn chưa gửi được. Kiểm tra kết nối mạng rồi thử lại.');
  }, [input, lastSentAt, showNotice]);

  const startCall = useCallback(async () => {
    if (!channelRef.current) return;
    try {
      await ensurePeer();
      setCallStatus('calling');
      await sendSignal('call-request');
      showNotice('Đang gọi người lạ...');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Không thể mở micro.';
      showNotice(message);
      resetCall(false);
    }
  }, [ensurePeer, resetCall, sendSignal, showNotice]);

  const acceptCall = useCallback(async () => {
    try {
      setCallStatus('connecting');
      await ensurePeer();
      await sendSignal('call-accept');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Không thể nhận cuộc gọi.';
      showNotice(message);
      await sendSignal('call-reject');
      resetCall(false);
    }
  }, [ensurePeer, resetCall, sendSignal, showNotice]);

  const rejectCall = useCallback(async () => {
    await sendSignal('call-reject');
    resetCall(false);
  }, [resetCall, sendSignal]);

  const toggleMic = useCallback(() => {
    const next = !micEnabled;
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = next;
    });
    setMicEnabled(next);
  }, [micEnabled]);

  const submitReport = useCallback(async () => {
    if (!supabase || !roomIdRef.current || !partnerIdRef.current) return;

    const { error } = await supabase.from('reports').insert({
      room_id: roomIdRef.current,
      reported_id: partnerIdRef.current,
      reason: reportReason
    });

    if (error) {
      showNotice(error.message);
      return;
    }

    setReportOpen(false);
    showNotice('Đã gửi báo cáo. Bạn có thể tìm người khác ngay.');
  }, [reportReason, showNotice]);

  const blockPartner = useCallback(async () => {
    if (!supabase || !partnerIdRef.current) return;

    const { error } = await supabase.from('blocks').insert({ blocked_id: partnerIdRef.current });
    if (error) {
      showNotice(error.message);
      return;
    }

    showNotice('Đã chặn người này.');
    await findNext();
  }, [findNext, showNotice]);

  useEffect(() => {
    let alive = true;

    async function boot() {
      if (!isSupabaseConfigured || !supabase) {
        setStatus('setup-error');
        setSetupError('Bạn cần điền NEXT_PUBLIC_SUPABASE_URL và NEXT_PUBLIC_SUPABASE_ANON_KEY trong .env.local.');
        return;
      }

      const current = await supabase.auth.getSession();
      if (!alive) return;

      if (current.data.session?.user) {
        setUser(current.data.session.user);
        setStatus('idle');
        return;
      }

      const { data, error } = await supabase.auth.signInAnonymously();
      if (!alive) return;

      if (error || !data.user) {
        setStatus('setup-error');
        setSetupError(error?.message ?? 'Không tạo được phiên ẩn danh. Hãy bật Anonymous Sign-ins trong Supabase Auth.');
        return;
      }

      setUser(data.user);
      setStatus('idle');
    }

    void boot();

    return () => {
      alive = false;
      stopWaitingTimer();
      resetCall(false);
      void detachRoomChannel();
    };
  }, [detachRoomChannel, resetCall, stopWaitingTimer]);

  return (
    <main className="min-h-screen px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-2.5rem)] w-full max-w-6xl grid-cols-1 items-center gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <section className="hidden lg:block">
          <div className="glass-card rounded-[2rem] p-8">
            <div className="mb-6 flex items-center gap-3">
              <div className="ig-gradient grid h-14 w-14 place-items-center rounded-2xl text-2xl font-black text-white shadow-soft">L</div>
              <div>
                <h1 className="text-4xl font-black tracking-tight ig-text-gradient">luvu</h1>
                <p className="text-sm text-slate-500">Trò chuyện ẩn danh với người lạ</p>
              </div>
            </div>

            <div className="space-y-4 text-slate-700">
              <Feature icon={<Sparkles size={18} />} title="Ghép đôi ngẫu nhiên" text="Bấm bắt đầu, hệ thống tự tìm một người đang chờ." />
              <Feature icon={<ShieldAlert size={18} />} title="Không lưu lịch sử chat" text="Tin nhắn realtime gửi qua Broadcast, không tạo bảng messages." />
              <Feature icon={<PhoneCall size={18} />} title="Text + voice call" text="Gọi thoại audio-only bằng WebRTC, báo hiệu qua Supabase." />
              <Feature icon={<Ban size={18} />} title="Report / block" text="Báo cáo và chặn người lạ để không bị ghép lại." />
            </div>

            <div className="mt-8 rounded-3xl border border-pink-100 bg-white/70 p-4 text-sm text-slate-600">
              <b className="text-slate-900">Nhắc an toàn:</b> không gửi số điện thoại, địa chỉ, mật khẩu, ảnh riêng tư hoặc thông tin cá nhân cho người lạ.
            </div>
          </div>
        </section>

        <section className="mx-auto flex w-full max-w-md flex-col overflow-hidden rounded-[2.2rem] border border-white/80 bg-white shadow-soft lg:min-h-[760px]">
          <Header
            status={status}
            partnerShortId={partnerShortId}
            callStatus={callStatus}
            hasPartner={Boolean(partnerId)}
            onLeave={() => void leaveRoom(true)}
            onReport={() => setReportOpen(true)}
            onBlock={() => void blockPartner()}
          />

          {notice && (
            <div className="mx-4 mt-3 rounded-2xl border border-pink-100 bg-pink-50 px-4 py-3 text-sm text-pink-700">
              {notice}
            </div>
          )}

          <div className="flex min-h-0 flex-1 flex-col">
            {status === 'booting' && <CenterCard icon={<Loader2 className="animate-spin" />} title="Đang mở luvu" text="Đang tạo phiên ẩn danh cho bạn..." />}

            {status === 'setup-error' && (
              <CenterCard
                icon={<ShieldAlert />}
                title="Cần cấu hình Supabase"
                text={setupError}
                actionText="Đọc README trong file zip"
              />
            )}

            {status === 'idle' && (
              <CenterCard
                icon={<Heart />}
                title="Sẵn sàng gặp người lạ?"
                text="Bạn sẽ được ghép đôi 1-1. Tin nhắn không lưu lịch sử, rời phòng là mất." 
                actionText="Bắt đầu trò chuyện"
                onAction={() => void startMatching()}
              />
            )}

            {status === 'matching' && <CenterCard icon={<Loader2 className="animate-spin" />} title="Đang tìm người lạ" text="Hệ thống đang kiểm tra hàng chờ..." />}

            {status === 'waiting' && (
              <CenterCard
                icon={<UserRound />}
                title="Đang chờ người phù hợp"
                text="Bạn đang ở hàng chờ. Khi có người khác bấm bắt đầu, phòng chat sẽ tự mở."
                actionText="Huỷ tìm kiếm"
                onAction={() => void leaveRoom(true)}
                secondaryText="Thử tìm lại"
                onSecondary={() => void startMatching()}
              />
            )}

            {status === 'chat' && (
              <>
                <CallPanel
                  callStatus={callStatus}
                  micEnabled={micEnabled}
                  hasRemoteAudio={hasRemoteAudio}
                  onStart={() => void startCall()}
                  onAccept={() => void acceptCall()}
                  onReject={() => void rejectCall()}
                  onEnd={() => resetCall(true)}
                  onToggleMic={toggleMic}
                />

                <div className="chat-scroll flex-1 space-y-3 overflow-y-auto px-4 py-4">
                  <div className="mx-auto mb-5 max-w-[88%] rounded-3xl bg-slate-100 px-4 py-3 text-center text-xs leading-relaxed text-slate-500">
                    Bạn đang nói chuyện với <b className="text-slate-800">{DISPLAY_NAME} #{partnerShortId}</b>. Đừng chia sẻ thông tin cá nhân.
                  </div>

                  {messages.map((message) => {
                    const mine = message.senderId === userIdRef.current;
                    return (
                      <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`max-w-[76%] rounded-[1.35rem] px-4 py-2.5 text-sm leading-relaxed shadow-sm ${
                            mine
                              ? 'ig-gradient rounded-br-md text-white'
                              : 'rounded-bl-md bg-slate-100 text-slate-900'
                          }`}
                        >
                          {message.text}
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>

                <div className="border-t border-slate-100 bg-white px-4 py-3 safe-bottom">
                  <div className="mb-3 flex gap-2">
                    <button
                      onClick={() => void findNext()}
                      className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      <RefreshCcw size={16} />
                      Tìm người khác
                    </button>
                    <button
                      onClick={() => void leaveRoom(true)}
                      className="flex items-center justify-center rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
                    >
                      Kết thúc
                    </button>
                  </div>

                  <form onSubmit={sendMessage} className="flex items-end gap-2 rounded-[1.6rem] bg-slate-100 p-2">
                    <textarea
                      value={input}
                      onChange={(event) => setInput(event.target.value)}
                      placeholder="Nhắn tin..."
                      rows={1}
                      className="max-h-28 min-h-10 flex-1 resize-none bg-transparent px-3 py-2 text-sm outline-none placeholder:text-slate-400"
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                          event.preventDefault();
                          void sendMessage(event as unknown as FormEvent);
                        }
                      }}
                    />
                    <button className="ig-gradient grid h-10 w-10 place-items-center rounded-full text-white shadow-sm transition active:scale-95" aria-label="Gửi">
                      <Send size={17} />
                    </button>
                  </form>
                </div>
              </>
            )}
          </div>
        </section>
      </div>

      <audio ref={remoteAudioRef} autoPlay playsInline />

      {reportOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/35 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-[1.8rem] bg-white p-5 shadow-soft">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-950">Báo cáo người lạ</h2>
                <p className="text-sm text-slate-500">Chọn lý do để gửi report.</p>
              </div>
              <button onClick={() => setReportOpen(false)} className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-600">
                <X size={17} />
              </button>
            </div>

            <select
              value={reportReason}
              onChange={(event) => setReportReason(event.target.value)}
              className="mb-4 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-pink-400"
            >
              <option value="spam">Spam / làm phiền</option>
              <option value="harassment">Quấy rối</option>
              <option value="unsafe-content">Nội dung không an toàn</option>
              <option value="personal-info">Xin thông tin cá nhân</option>
              <option value="other">Khác</option>
            </select>

            <div className="flex gap-2">
              <button onClick={() => setReportOpen(false)} className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">
                Huỷ
              </button>
              <button onClick={() => void submitReport()} className="ig-gradient flex-1 rounded-2xl px-4 py-3 text-sm font-semibold text-white">
                Gửi báo cáo
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Header({
  status,
  partnerShortId,
  callStatus,
  hasPartner,
  onLeave,
  onReport,
  onBlock
}: {
  status: AppStatus;
  partnerShortId: string;
  callStatus: CallStatus;
  hasPartner: boolean;
  onLeave: () => void;
  onReport: () => void;
  onBlock: () => void;
}) {
  const subtitle = status === 'chat' ? `Người lạ #${partnerShortId}` : 'Ẩn danh • realtime';

  return (
    <header className="flex items-center justify-between border-b border-slate-100 bg-white/95 px-4 py-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="ig-gradient grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-black text-white shadow-sm">L</div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-lg font-black text-slate-950">luvu</h1>
            {status === 'chat' && <span className="h-2 w-2 rounded-full bg-emerald-500" />}
          </div>
          <p className="truncate text-xs text-slate-500">{callStatus === 'in-call' ? 'Đang gọi thoại' : subtitle}</p>
        </div>
      </div>

      {hasPartner && (
        <div className="flex items-center gap-1">
          <button onClick={onReport} className="grid h-9 w-9 place-items-center rounded-full text-slate-500 hover:bg-slate-100" title="Báo cáo">
            <Flag size={17} />
          </button>
          <button onClick={onBlock} className="grid h-9 w-9 place-items-center rounded-full text-slate-500 hover:bg-slate-100" title="Chặn">
            <Ban size={17} />
          </button>
          <button onClick={onLeave} className="grid h-9 w-9 place-items-center rounded-full text-slate-500 hover:bg-slate-100" title="Rời phòng">
            <X size={18} />
          </button>
        </div>
      )}
    </header>
  );
}

function Feature({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="flex gap-3 rounded-3xl bg-white/65 p-4">
      <div className="ig-gradient grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-white">{icon}</div>
      <div>
        <h3 className="font-bold text-slate-950">{title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-slate-500">{text}</p>
      </div>
    </div>
  );
}

function CenterCard({
  icon,
  title,
  text,
  actionText,
  onAction,
  secondaryText,
  onSecondary
}: {
  icon: ReactNode;
  title: string;
  text: string;
  actionText?: string;
  onAction?: () => void;
  secondaryText?: string;
  onSecondary?: () => void;
}) {
  return (
    <div className="grid flex-1 place-items-center px-6 py-10 text-center">
      <div className="max-w-xs">
        <div className="ig-gradient mx-auto mb-5 grid h-20 w-20 place-items-center rounded-[1.7rem] text-white shadow-soft [&_svg]:h-8 [&_svg]:w-8">{icon}</div>
        <h2 className="text-2xl font-black tracking-tight text-slate-950">{title}</h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-500">{text}</p>
        {actionText && onAction && (
          <button onClick={onAction} className="ig-gradient mt-6 w-full rounded-2xl px-5 py-3.5 text-sm font-bold text-white shadow-soft transition active:scale-[0.98]">
            {actionText}
          </button>
        )}
        {secondaryText && onSecondary && (
          <button onClick={onSecondary} className="mt-3 w-full rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
            {secondaryText}
          </button>
        )}
      </div>
    </div>
  );
}

function CallPanel({
  callStatus,
  micEnabled,
  hasRemoteAudio,
  onStart,
  onAccept,
  onReject,
  onEnd,
  onToggleMic
}: {
  callStatus: CallStatus;
  micEnabled: boolean;
  hasRemoteAudio: boolean;
  onStart: () => void;
  onAccept: () => void;
  onReject: () => void;
  onEnd: () => void;
  onToggleMic: () => void;
}) {
  if (callStatus === 'idle') {
    return (
      <div className="border-b border-slate-100 px-4 py-3">
        <button onClick={onStart} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-bold text-white transition hover:bg-slate-800">
          <Phone size={16} />
          Gọi thoại
        </button>
      </div>
    );
  }

  if (callStatus === 'ringing') {
    return (
      <div className="border-b border-slate-100 bg-pink-50 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-slate-950">Người lạ đang gọi</p>
            <p className="text-xs text-slate-500">Nhận cuộc gọi audio-only</p>
          </div>
          <div className="flex gap-2">
            <button onClick={onReject} className="grid h-10 w-10 place-items-center rounded-full bg-red-500 text-white">
              <PhoneOff size={17} />
            </button>
            <button onClick={onAccept} className="grid h-10 w-10 place-items-center rounded-full bg-emerald-500 text-white">
              <PhoneCall size={17} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-slate-100 bg-slate-950 px-4 py-3 text-white">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold">
            {callStatus === 'calling' && 'Đang gọi...'}
            {callStatus === 'connecting' && 'Đang kết nối...'}
            {callStatus === 'in-call' && 'Đang gọi thoại'}
          </p>
          <p className="text-xs text-slate-300">{hasRemoteAudio ? 'Đã nhận audio từ người lạ' : 'Đang chờ audio'}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={onToggleMic} className="grid h-10 w-10 place-items-center rounded-full bg-white/12 text-white">
            {micEnabled ? <Mic size={17} /> : <MicOff size={17} />}
          </button>
          <button onClick={onEnd} className="grid h-10 w-10 place-items-center rounded-full bg-red-500 text-white">
            <PhoneOff size={17} />
          </button>
        </div>
      </div>
    </div>
  );
}
