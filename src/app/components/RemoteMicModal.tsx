import { useState, useEffect, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/app/components/ui/dialog';
import { Button } from '@/app/components/ui/button';
import { Smartphone, Wifi, WifiOff, Loader2, Copy, Check, X, Mic } from 'lucide-react';
import { RemoteMicHost, generateSessionId, getSessionUrl, RemoteMicMessage } from '@/services/remoteMicService';
import { toast } from 'sonner';

interface Segment {
  text: string;
  speaker: 'doctor' | 'patient' | 'pending';
}

interface RemoteMicModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnectionChange: (connected: boolean) => void;
  onSegmentsUpdate: (segments: Segment[]) => void;
  onTranscriptUpdate: (text: string) => void;
  onRemoteRecordingStart: () => void;
  onRemoteRecordingStop: () => void;
}

export function RemoteMicModal({
  open,
  onOpenChange,
  onConnectionChange,
  onSegmentsUpdate,
  onTranscriptUpdate,
  onRemoteRecordingStart,
  onRemoteRecordingStop,
}: RemoteMicModalProps) {
  const [sessionId, setSessionId] = useState<string>('');
  const [sessionUrl, setSessionUrl] = useState<string>('');
  const [isConnected, setIsConnected] = useState(false);
  const [isRemoteRecording, setIsRemoteRecording] = useState(false);
  const [copied, setCopied] = useState(false);
  const [host, setHost] = useState<RemoteMicHost | null>(null);

  // 세션 시작
  const startSession = useCallback(() => {
    const newSessionId = generateSessionId();
    const url = getSessionUrl(newSessionId);
    setSessionId(newSessionId);
    setSessionUrl(url);
    setIsConnected(false);
    setIsRemoteRecording(false);

    const newHost = new RemoteMicHost(
      newSessionId,
      (message: RemoteMicMessage) => {
        switch (message.type) {
          case 'connected':
            toast.success('휴대폰이 연결되었습니다!');
            break;
          case 'recording_start':
            setIsRemoteRecording(true);
            onRemoteRecordingStart();
            break;
          case 'recording_stop':
            setIsRemoteRecording(false);
            onRemoteRecordingStop();
            break;
          case 'transcript':
            if (message.data?.text) {
              onTranscriptUpdate(message.data.text);
            }
            break;
          case 'segment':
            if (message.data?.segments) {
              onSegmentsUpdate(message.data.segments);
            }
            break;
        }
      },
      (connected) => {
        setIsConnected(connected);
        onConnectionChange(connected);
        if (!connected && isRemoteRecording) {
          setIsRemoteRecording(false);
          onRemoteRecordingStop();
        }
      }
    );

    newHost.start();
    setHost(newHost);
  }, [onSegmentsUpdate, onTranscriptUpdate, onRemoteRecordingStart, onRemoteRecordingStop, onConnectionChange, isRemoteRecording]);

  // 모달 열릴 때 세션 시작
  useEffect(() => {
    if (open && !host) {
      startSession();
    }
    
    return () => {
      if (!open && host) {
        host.stop();
        setHost(null);
        setIsConnected(false);
        setIsRemoteRecording(false);
      }
    };
  }, [open, host, startSession]);

  // 모달 닫힐 때 - 연결 안 된 상태면 정리
  useEffect(() => {
    if (!open && host && !isConnected) {
      host.stop();
      setHost(null);
      onConnectionChange(false);
    }
  }, [open, host, isConnected, onConnectionChange]);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(sessionId);
    setCopied(true);
    toast.success('세션 코드가 복사되었습니다');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleNewSession = () => {
    if (host) {
      host.stop();
      setHost(null);
      onConnectionChange(false);
    }
    startSession();
  };

  // 연결 끊기 (완전 종료)
  const handleDisconnect = () => {
    if (host) {
      host.stop();
      setHost(null);
    }
    setIsConnected(false);
    setIsRemoteRecording(false);
    onConnectionChange(false);
    onOpenChange(false);
  };

  // 모달만 닫기 (연결 유지)
  const handleCloseKeepConnection = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(openState) => {
      if (!openState && isConnected) {
        // 연결된 상태에서 모달 닫기 → 연결 유지
        handleCloseKeepConnection();
      } else if (!openState) {
        // 연결 안 된 상태에서 모달 닫기
        handleDisconnect();
      }
    }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-teal-600" />
            휴대폰 마이크 연결
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Connection Status */}
          <div className={`flex items-center justify-center gap-2 py-2 px-4 rounded-lg ${
            isConnected 
              ? 'bg-green-50 text-green-700' 
              : 'bg-slate-50 text-slate-600'
          }`}>
            {isConnected ? (
              <>
                <Wifi className="w-4 h-4" />
                <span className="text-sm font-medium">휴대폰 연결됨</span>
                {isRemoteRecording && (
                  <span className="flex items-center gap-1 ml-2 text-red-500">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    녹음 중
                  </span>
                )}
              </>
            ) : (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">휴대폰 연결 대기 중...</span>
              </>
            )}
          </div>

          {/* QR Code */}
          {!isConnected && (
            <div className="flex flex-col items-center">
              <div className="bg-white p-4 rounded-xl border-2 border-slate-200 shadow-sm">
                <QRCodeSVG 
                  value={sessionUrl} 
                  size={180}
                  level="M"
                  includeMargin={false}
                />
              </div>
              <p className="text-sm text-slate-500 mt-4 text-center">
                휴대폰 카메라로 QR 코드를 스캔하세요
              </p>
            </div>
          )}

          {/* Connected State */}
          {isConnected && !isRemoteRecording && (
            <div className="text-center py-6">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <Mic className="w-8 h-8 text-green-600" />
              </div>
              <p className="text-slate-600">
                휴대폰에서 <span className="font-semibold text-red-500">마이크 버튼</span>을 눌러
              </p>
              <p className="text-slate-600">녹음을 시작하세요</p>
            </div>
          )}

          {/* Recording State */}
          {isConnected && isRemoteRecording && (
            <div className="text-center py-6">
              <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4 relative">
                <Mic className="w-8 h-8 text-red-600" />
                <span className="absolute inset-0 rounded-full bg-red-500/30 animate-ping" />
              </div>
              <p className="text-slate-800 font-semibold">녹음 중...</p>
              <p className="text-sm text-slate-500 mt-1">실시간으로 텍스트가 전송됩니다</p>
            </div>
          )}

          {/* Session Code */}
          <div className="flex items-center justify-between bg-slate-50 rounded-lg p-3">
            <div>
              <p className="text-xs text-slate-500">세션 코드</p>
              <p className="font-mono font-bold text-lg tracking-wider">{sessionId}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyCode}
              className="shrink-0"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </Button>
          </div>

          {/* Instructions */}
          {!isConnected && (
            <div className="text-xs text-slate-500 space-y-1">
              <p>📱 휴대폰 카메라 앱으로 QR 코드를 스캔하거나</p>
              <p>🌐 브라우저에서 <span className="font-mono text-teal-600">{window.location.host}?mic={sessionId}</span> 접속</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            {!isConnected ? (
              <>
                <Button 
                  variant="outline" 
                  onClick={handleNewSession}
                  className="flex-1"
                >
                  새 세션 생성
                </Button>
                <Button 
                  variant="outline"
                  onClick={handleDisconnect}
                  className="flex-1"
                >
                  취소
                </Button>
              </>
            ) : (
              <>
                <Button 
                  variant="outline"
                  onClick={handleDisconnect}
                  className="flex-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <X className="w-4 h-4 mr-1" />
                  연결 끊기
                </Button>
                <Button 
                  onClick={handleCloseKeepConnection}
                  className="flex-1 bg-teal-600 hover:bg-teal-700"
                >
                  연결 유지하며 닫기
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
