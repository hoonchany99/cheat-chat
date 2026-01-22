import { supabase } from './supabaseClient';
import { RealtimeChannel } from '@supabase/supabase-js';

// 세션 ID 생성 (6자리 영문+숫자)
export function generateSessionId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 혼동되는 문자 제외 (0, O, 1, I)
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// 세션 URL 생성
export function getSessionUrl(sessionId: string): string {
  const baseUrl = window.location.origin;
  return `${baseUrl}?mic=${sessionId}`;
}

// 메시지 타입 정의
export interface RemoteMicMessage {
  type: 'connected' | 'recording_start' | 'recording_stop' | 'transcript' | 'segment' | 'error' | 'ping';
  sessionId: string;
  data?: {
    text?: string;
    speaker?: 'doctor' | 'patient' | 'pending';
    segments?: Array<{ text: string; speaker: 'doctor' | 'patient' | 'pending' }>;
    isFinal?: boolean;
    error?: string;
  };
  timestamp: number;
}

// 데스크톱용: 세션 생성 및 구독
export class RemoteMicHost {
  private channel: RealtimeChannel | null = null;
  private sessionId: string;
  private onMessage: (message: RemoteMicMessage) => void;
  private onConnectionChange: (connected: boolean) => void;
  private isConnected: boolean = false;
  private pingInterval: NodeJS.Timeout | null = null;

  constructor(
    sessionId: string,
    onMessage: (message: RemoteMicMessage) => void,
    onConnectionChange: (connected: boolean) => void
  ) {
    this.sessionId = sessionId;
    this.onMessage = onMessage;
    this.onConnectionChange = onConnectionChange;
  }

  async start(): Promise<void> {
    const channelName = `remote-mic-${this.sessionId}`;
    
    this.channel = supabase.channel(channelName, {
      config: {
        broadcast: { self: false }
      }
    });

    this.channel
      .on('broadcast', { event: 'mic-message' }, (payload) => {
        const message = payload.payload as RemoteMicMessage;
        
        if (message.type === 'connected') {
          this.isConnected = true;
          this.onConnectionChange(true);
        } else if (message.type === 'ping') {
          // 모바일에서 ping 받음 - 연결 유지 확인
        }
        
        this.onMessage(message);
      })
      .subscribe((status) => {
        console.log('Host channel status:', status);
      });

    // 연결 상태 체크를 위한 ping
    this.pingInterval = setInterval(() => {
      if (this.channel) {
        this.channel.send({
          type: 'broadcast',
          event: 'host-ping',
          payload: { sessionId: this.sessionId, timestamp: Date.now() }
        });
      }
    }, 5000);
  }

  stop(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.channel) {
      supabase.removeChannel(this.channel);
      this.channel = null;
    }
    this.isConnected = false;
    this.onConnectionChange(false);
  }

  getSessionId(): string {
    return this.sessionId;
  }

  getIsConnected(): boolean {
    return this.isConnected;
  }
}

// 모바일용: 세션 참여 및 메시지 전송
export class RemoteMicClient {
  private channel: RealtimeChannel | null = null;
  private sessionId: string;
  private onHostPing: () => void;
  private pingInterval: NodeJS.Timeout | null = null;

  constructor(sessionId: string, onHostPing: () => void) {
    this.sessionId = sessionId;
    this.onHostPing = onHostPing;
  }

  async connect(): Promise<boolean> {
    const channelName = `remote-mic-${this.sessionId}`;
    
    this.channel = supabase.channel(channelName, {
      config: {
        broadcast: { self: false }
      }
    });

    return new Promise((resolve) => {
      this.channel!
        .on('broadcast', { event: 'host-ping' }, () => {
          this.onHostPing();
        })
        .subscribe((status) => {
          console.log('Client channel status:', status);
          if (status === 'SUBSCRIBED') {
            // 연결 알림 전송
            this.sendMessage({
              type: 'connected',
              sessionId: this.sessionId,
              timestamp: Date.now()
            });
            
            // 주기적 ping 시작
            this.pingInterval = setInterval(() => {
              this.sendMessage({
                type: 'ping',
                sessionId: this.sessionId,
                timestamp: Date.now()
              });
            }, 3000);
            
            resolve(true);
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            resolve(false);
          }
        });
    });
  }

  sendMessage(message: RemoteMicMessage): void {
    if (this.channel) {
      this.channel.send({
        type: 'broadcast',
        event: 'mic-message',
        payload: message
      });
    }
  }

  // 녹음 시작 알림
  notifyRecordingStart(): void {
    this.sendMessage({
      type: 'recording_start',
      sessionId: this.sessionId,
      timestamp: Date.now()
    });
  }

  // 녹음 종료 알림
  notifyRecordingStop(): void {
    this.sendMessage({
      type: 'recording_stop',
      sessionId: this.sessionId,
      timestamp: Date.now()
    });
  }

  // 실시간 텍스트 전송
  sendTranscript(text: string, isFinal: boolean = false): void {
    this.sendMessage({
      type: 'transcript',
      sessionId: this.sessionId,
      data: { text, isFinal },
      timestamp: Date.now()
    });
  }

  // 세그먼트 전송 (화자 분류 포함)
  sendSegments(segments: Array<{ text: string; speaker: 'doctor' | 'patient' | 'pending' }>): void {
    this.sendMessage({
      type: 'segment',
      sessionId: this.sessionId,
      data: { segments },
      timestamp: Date.now()
    });
  }

  disconnect(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.channel) {
      supabase.removeChannel(this.channel);
      this.channel = null;
    }
  }
}
