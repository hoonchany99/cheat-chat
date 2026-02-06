import { Plus, X, User } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { PatientSession } from '../App';

interface PatientSidebarProps {
  sessions: PatientSession[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void;
  isRecording: boolean;
}

export function PatientSidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  isRecording,
}: PatientSidebarProps) {
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (date: Date) => {
    const today = new Date();
    const isToday = date.toDateString() === today.toDateString();
    if (isToday) {
      return formatTime(date);
    }
    return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }) + ' ' + formatTime(date);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 border-r border-slate-200">
      {/* Header with New Patient Button */}
      <div className="p-3 border-b border-slate-200">
        <Button
          onClick={onNewSession}
          disabled={isRecording || sessions.length >= 5}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white"
          size="sm"
        >
          <Plus className="w-4 h-4 mr-2" />
          새 환자
        </Button>
        {sessions.length >= 5 && (
          <p className="text-xs text-slate-500 mt-2 text-center">최대 5명까지 가능</p>
        )}
      </div>

      {/* Sessions List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {sessions.length === 0 ? (
          <div className="text-center text-slate-400 text-sm py-8">
            환자가 없습니다
          </div>
        ) : (
          sessions.map((session) => {
            const isActive = session.id === activeSessionId;

            return (
              <div
                key={session.id}
                onClick={() => !isRecording && onSelectSession(session.id)}
                className={`relative group p-3 rounded-lg cursor-pointer transition-all ${
                  isActive
                    ? 'bg-white border-2 border-blue-500 shadow-sm'
                    : 'bg-white border border-slate-200 hover:border-slate-300 hover:shadow-sm'
                } ${isRecording && !isActive ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {/* Delete Button */}
                {!isRecording && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteSession(session.id);
                    }}
                    className="absolute top-2 right-2 p-1 rounded-full opacity-0 group-hover:opacity-100 hover:bg-slate-100 transition-opacity"
                  >
                    <X className="w-3 h-3 text-slate-400" />
                  </button>
                )}

                {/* Patient Info */}
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                    <User className="w-3 h-3 text-slate-400" />
                  </div>
                  <span className="font-medium text-sm text-slate-800 truncate">
                    {session.patientName || '이름 없음'}
                  </span>
                </div>

                {/* Time */}
                <div className="ml-8">
                  <span className="text-xs text-slate-400">
                    {formatDate(session.createdAt)}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
