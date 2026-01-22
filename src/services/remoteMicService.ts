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
    console.log('[Host] Starting channel:', channelName);
    
    this.channel = supabase.channel(channelName, {
      config: {
        broadcast: { self: false }
      }
    });

    this.channel
      .on('broadcast', { event: 'mic-message' }, (payload) => {
        console.log('[Host] Received mic-message:', payload);
        const message = payload.payload as RemoteMicMessage;
        
        if (message.type === 'connected') {
          console.log('[Host] Mobile connected!');
          this.isConnected = true;
          this.onConnectionChange(true);
        } else if (message.type === 'ping') {
          console.log('[Host] Received ping from mobile');
        } else if (message.type === 'transcript') {
          console.log('[Host] Received transcript:', message.data?.text);
        } else if (message.type === 'segment') {
          console.log('[Host] Received segments:', message.data?.segments?.length);
        }
        
        this.onMessage(message);
      })
      .subscribe((status) => {
        console.log('[Host] Channel status:', status);
        if (status === 'SUBSCRIBED') {
          console.log('[Host] Successfully subscribed to channel');
          // 구독 성공 후 첫 ping 전송
          this.sendHostPing();
        }
      });

    // 연결 상태 체크를 위한 ping
    this.pingInterval = setInterval(() => {
      this.sendHostPing();
    }, 5000);
  }

  private async sendHostPing(): Promise<void> {
    if (this.channel) {
      const result = await this.channel.send({
        type: 'broadcast',
        event: 'host-ping',
        payload: { sessionId: this.sessionId, timestamp: Date.now() }
      });
      console.log('[Host] Sent host-ping, result:', result);
    }
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
    console.log('[Client] Connecting to channel:', channelName);
    
    this.channel = supabase.channel(channelName, {
      config: {
        broadcast: { self: false }
      }
    });

    return new Promise((resolve) => {
      this.channel!
        .on('broadcast', { event: 'host-ping' }, (payload) => {
          console.log('[Client] Received host-ping:', payload);
          this.onHostPing();
        })
        .subscribe((status) => {
          console.log('[Client] Channel status:', status);
          if (status === 'SUBSCRIBED') {
            console.log('[Client] Successfully subscribed to channel');
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
            console.log('[Client] Connection failed:', status);
            resolve(false);
          }
        });
    });
  }

  async sendMessage(message: RemoteMicMessage): Promise<void> {
    if (this.channel) {
      const result = await this.channel.send({
        type: 'broadcast',
        event: 'mic-message',
        payload: message
      });
      console.log(`[Client] Sent ${message.type}, result:`, result);
    } else {
      console.log('[Client] Cannot send message - channel is null');
    }
  }

  // 녹음 시작 알림
  async notifyRecordingStart(): Promise<void> {
    console.log('[Client] Notifying recording start');
    await this.sendMessage({
      type: 'recording_start',
      sessionId: this.sessionId,
      timestamp: Date.now()
    });
  }

  // 녹음 종료 알림
  async notifyRecordingStop(): Promise<void> {
    console.log('[Client] Notifying recording stop');
    await this.sendMessage({
      type: 'recording_stop',
      sessionId: this.sessionId,
      timestamp: Date.now()
    });
  }

  // 실시간 텍스트 전송
  async sendTranscript(text: string, isFinal: boolean = false): Promise<void> {
    await this.sendMessage({
      type: 'transcript',
      sessionId: this.sessionId,
      data: { text, isFinal },
      timestamp: Date.now()
    });
  }

  // 세그먼트 전송 (화자 분류 포함)
  async sendSegments(segments: Array<{ text: string; speaker: 'doctor' | 'patient' | 'pending' }>): Promise<void> {
    await this.sendMessage({
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
