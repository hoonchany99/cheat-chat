import { useState, useEffect, useRef } from 'react';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Card, CardContent } from '@/app/components/ui/card';
import { toast } from 'sonner';
import { 
  Mic, 
  FileText, 
  ArrowRight, 
  Stethoscope,
  MessageSquare,
  Clock,
  Shield,
  Check,
  Play,
  Copy,
  Zap,
  ChevronRight
} from 'lucide-react';

// 스크롤 애니메이션 훅
function useScrollAnimation() {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect(); // 한 번만 트리거
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -50px 0px' }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, []);

  return { ref, isVisible };
}

// CSS 애니메이션 스타일
const animationStyles = `
  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(30px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  
  @keyframes slideInLeft {
    from {
      opacity: 0;
      transform: translateX(-30px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }
  
  @keyframes slideInRight {
    from {
      opacity: 0;
      transform: translateX(30px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }
  
  @keyframes float {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-20px); }
  }
  
  @keyframes pulse-glow {
    0%, 100% { box-shadow: 0 0 20px rgba(20, 184, 166, 0.3); }
    50% { box-shadow: 0 0 40px rgba(20, 184, 166, 0.6); }
  }
  
  @keyframes typewriter {
    from { width: 0; }
    to { width: 100%; }
  }
  
  .animate-fade-in-up {
    animation: fadeInUp 0.8s ease-out forwards;
    opacity: 0;
  }
  
  .animate-fade-in {
    animation: fadeIn 0.6s ease-out forwards;
    opacity: 0;
  }
  
  .animate-slide-in-left {
    animation: slideInLeft 0.8s ease-out forwards;
    opacity: 0;
  }
  
  .animate-slide-in-right {
    animation: slideInRight 0.8s ease-out forwards;
    opacity: 0;
  }
  
  .animate-float {
    animation: float 6s ease-in-out infinite;
  }
  
  .animate-pulse-glow {
    animation: pulse-glow 2s ease-in-out infinite;
  }
  
  .delay-100 { animation-delay: 0.1s; }
  .delay-200 { animation-delay: 0.2s; }
  .delay-300 { animation-delay: 0.3s; }
  .delay-400 { animation-delay: 0.4s; }
  .delay-500 { animation-delay: 0.5s; }
  .delay-600 { animation-delay: 0.6s; }
  .delay-700 { animation-delay: 0.7s; }
  .delay-800 { animation-delay: 0.8s; }
  
  /* 스크롤 트리거 애니메이션 */
  .scroll-hidden {
    opacity: 0;
    transform: translateY(40px);
    transition: opacity 0.8s ease-out, transform 0.8s ease-out;
  }
  
  .scroll-visible {
    opacity: 1;
    transform: translateY(0);
  }
  
  .scroll-hidden-left {
    opacity: 0;
    transform: translateX(-40px);
    transition: opacity 0.8s ease-out, transform 0.8s ease-out;
  }
  
  .scroll-hidden-right {
    opacity: 0;
    transform: translateX(40px);
    transition: opacity 0.8s ease-out, transform 0.8s ease-out;
  }
  
  .scroll-visible-x {
    opacity: 1;
    transform: translateX(0);
  }
  
  .scroll-scale-hidden {
    opacity: 0;
    transform: scale(0.9);
    transition: opacity 0.6s ease-out, transform 0.6s ease-out;
  }
  
  .scroll-scale-visible {
    opacity: 1;
    transform: scale(1);
  }
  
  .stagger-1 { transition-delay: 0.1s; }
  .stagger-2 { transition-delay: 0.2s; }
  .stagger-3 { transition-delay: 0.3s; }
  .stagger-4 { transition-delay: 0.4s; }
`;

interface LandingPageProps {
  onStart: () => void;
}

export function LandingPage({ onStart }: LandingPageProps) {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [showDemo, setShowDemo] = useState(false);

  // 스크롤 애니메이션
  const demoSection = useScrollAnimation();
  const howItWorksSection = useScrollAnimation();
  const benefitsSection = useScrollAnimation();
  const ctaSection = useScrollAnimation();

  // 데모 대화 순차 표시
  useEffect(() => {
    const timer = setTimeout(() => setShowDemo(true), 800);
    return () => clearTimeout(timer);
  }, []);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !email.includes('@')) {
      toast.error('올바른 이메일을 입력해주세요');
      return;
    }

    setIsSubmitting(true);
    await new Promise(resolve => setTimeout(resolve, 800));
    console.log('Email subscribed:', email);
    setIsSubscribed(true);
    toast.success('구독해주셔서 감사합니다!');
    setIsSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Inject animation styles */}
      <style>{animationStyles}</style>
      
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="bg-gradient-to-br from-teal-500 to-teal-600 text-white p-2 rounded-xl shadow-lg shadow-teal-500/20">
              <Stethoscope className="w-5 h-5" />
            </div>
            <span className="font-bold text-lg">Cheat Chat AI</span>
          </div>
          
          <Button onClick={onStart} className="bg-teal-600 hover:bg-teal-700 shadow-lg shadow-teal-600/20">
            시작하기
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-24 px-4 relative overflow-hidden">
        {/* Animated background decoration */}
        <div className="absolute top-20 left-10 w-72 h-72 bg-teal-100 rounded-full blur-3xl opacity-40 animate-float" />
        <div className="absolute bottom-10 right-10 w-96 h-96 bg-blue-100 rounded-full blur-3xl opacity-30 animate-float" style={{ animationDelay: '2s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-cyan-50 rounded-full blur-3xl opacity-20 animate-pulse" />
        
        <div className="container mx-auto max-w-4xl text-center relative">
          <div className="animate-fade-in-up inline-flex items-center gap-2 px-4 py-2 rounded-full bg-teal-50 border border-teal-100 text-teal-700 text-sm font-medium mb-8">
            <div className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
            AI 기반 의료 차팅 솔루션
          </div>

          <h1 className="animate-fade-in-up delay-200 text-4xl md:text-5xl lg:text-6xl font-bold text-slate-900 mb-6 leading-tight">
            진료 대화를
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-600 to-cyan-600">
              AI가 자동으로 차팅
            </span>
          </h1>
          
          <p className="animate-fade-in-up delay-400 text-lg text-slate-600 mb-10 max-w-2xl mx-auto leading-relaxed">
            녹음 버튼 하나로 의사-환자 대화를 텍스트로 변환하고,
            <br className="hidden md:block" />
            <span className="font-medium text-slate-700">EMR에 바로 붙여넣을 수 있는 차트</span>를 생성합니다.
          </p>

          <div className="animate-fade-in-up delay-500 flex flex-col sm:flex-row items-center justify-center gap-4 mb-6">
            <Button
              size="lg"
              onClick={onStart}
              className="w-full sm:w-auto text-base px-8 py-6 bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-700 hover:to-teal-600 shadow-xl shadow-teal-600/25 transition-all hover:shadow-2xl hover:shadow-teal-600/30 hover:scale-105 animate-pulse-glow"
            >
              <Play className="w-5 h-5 mr-2" />
              바로 시작하기
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </div>

          <div className="animate-fade-in-up delay-600 flex items-center justify-center gap-6 text-sm text-slate-500">
            <span className="flex items-center gap-1.5">
              <Check className="w-4 h-4 text-teal-500" />
              로그인 필요없음
            </span>
            <span className="flex items-center gap-1.5">
              <Check className="w-4 h-4 text-teal-500" />
              무료 체험
            </span>
          </div>
        </div>
      </section>

      {/* Demo Preview */}
      <section ref={demoSection.ref} className="py-16 px-4">
        <div className={`container mx-auto max-w-5xl scroll-scale-hidden ${demoSection.isVisible ? 'scroll-scale-visible' : ''}`}>
          <Card className="border-0 shadow-2xl shadow-slate-200/50 overflow-hidden">
            <CardContent className="!p-0">
              <div className="grid md:grid-cols-2">
                {/* Left - Recording */}
                <div className="p-6 bg-white">
                  <div className="flex items-center gap-2 h-8 mb-4">
                    <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse shadow-lg shadow-red-500/50" />
                    <span className="text-sm font-semibold text-red-600">녹음 중</span>
                  </div>
                  <div className="bg-slate-50 rounded-xl px-4 py-4 border border-slate-100 flex items-center">
                    {showDemo && (
                      <div className="space-y-2 w-full">
                        <div className="animate-slide-in-left flex items-start gap-2.5">
                          <span className="text-xs font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md shrink-0">의사</span>
                          <p className="text-sm text-slate-700">"어디가 불편해서 오셨나요?"</p>
                        </div>
                        <div className="animate-slide-in-left delay-300 flex items-start gap-2.5">
                          <span className="text-xs font-semibold text-slate-600 bg-slate-200 px-2 py-0.5 rounded-md shrink-0">환자</span>
                          <p className="text-sm text-slate-700">"3일 전부터 두통이 있어서요."</p>
                        </div>
                        <div className="animate-slide-in-left delay-600 flex items-start gap-2.5">
                          <span className="text-xs font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md shrink-0">의사</span>
                          <p className="text-sm text-slate-700">"어지러움은 없으셨나요?"</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right - Chart Result */}
                <div className="p-6 bg-gradient-to-br from-teal-50 to-cyan-50">
                  <div className="flex items-center justify-between h-8 mb-4">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-teal-600" />
                      <span className="text-sm font-semibold text-teal-700">AI 생성 차트</span>
                    </div>
                    {showDemo && (
                      <Button size="sm" variant="outline" className="animate-fade-in delay-800 text-xs h-7 border-teal-200 text-teal-700 hover:bg-teal-50 hover:scale-105 transition-transform">
                        <Copy className="w-3 h-3 mr-1.5" />
                        EMR에 복사
                      </Button>
                    )}
                  </div>
                  <div className="bg-white rounded-xl px-4 py-4 border border-teal-100 flex items-center">
                    {showDemo && (
                      <div className="animate-slide-in-right delay-400 space-y-2 w-full">
                        <div className="animate-fade-in delay-500 text-sm">
                          <span className="font-semibold text-teal-700">C.C.</span>
                          <span className="ml-2 text-slate-700">두통이 있어서 왔어요</span>
                        </div>
                        <div className="animate-fade-in delay-600 text-sm">
                          <span className="font-semibold text-teal-700">P.I.</span>
                          <span className="ml-2 text-slate-700">3d ago onset, a.m. aggravation</span>
                        </div>
                        <div className="animate-fade-in delay-700 text-sm">
                          <span className="font-semibold text-teal-700">R.O.S.</span>
                          <span className="ml-2 text-slate-700">Dz(-), N/V(-), visual Sx(-)</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* How it Works */}
      <section ref={howItWorksSection.ref} className="py-24 px-4 bg-white">
        <div className="container mx-auto max-w-5xl">
          <h2 className={`text-2xl md:text-3xl font-bold text-center text-slate-900 mb-4 scroll-hidden ${howItWorksSection.isVisible ? 'scroll-visible' : ''}`}>
            사용 방법
          </h2>
          <p className={`text-slate-500 text-center mb-16 scroll-hidden stagger-1 ${howItWorksSection.isVisible ? 'scroll-visible' : ''}`}>
            3단계로 간편하게 차트를 생성하세요
          </p>

          <div className="grid md:grid-cols-3 gap-8">
            <div className={`text-center group hover:-translate-y-2 transition-all duration-300 scroll-hidden stagger-1 ${howItWorksSection.isVisible ? 'scroll-visible' : ''}`}>
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center mx-auto mb-5 shadow-xl shadow-teal-500/30 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
                <Mic className="w-7 h-7 text-white" />
              </div>
              <div className="text-xs font-bold text-teal-600 mb-2 tracking-wide">STEP 1</div>
              <h3 className="font-bold text-slate-900 mb-2 text-lg">녹음 시작</h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                마이크 버튼을 클릭하여<br />진료 대화를 녹음합니다.
              </p>
            </div>

            <div className={`text-center group hover:-translate-y-2 transition-all duration-300 scroll-hidden stagger-2 ${howItWorksSection.isVisible ? 'scroll-visible' : ''}`}>
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-cyan-600 flex items-center justify-center mx-auto mb-5 shadow-xl shadow-cyan-500/30 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
                <MessageSquare className="w-7 h-7 text-white" />
              </div>
              <div className="text-xs font-bold text-cyan-600 mb-2 tracking-wide">STEP 2</div>
              <h3 className="font-bold text-slate-900 mb-2 text-lg">실시간 변환</h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                AI가 음성을 텍스트로 변환하고<br />화자를 자동 구분합니다.
              </p>
            </div>

            <div className={`text-center group hover:-translate-y-2 transition-all duration-300 scroll-hidden stagger-3 ${howItWorksSection.isVisible ? 'scroll-visible' : ''}`}>
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center mx-auto mb-5 shadow-xl shadow-blue-500/30 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
                <FileText className="w-7 h-7 text-white" />
              </div>
              <div className="text-xs font-bold text-blue-600 mb-2 tracking-wide">STEP 3</div>
              <h3 className="font-bold text-slate-900 mb-2 text-lg">차트 생성</h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                AI가 C.C, P.I 등<br />차트를 자동 생성합니다.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section ref={benefitsSection.ref} className="py-24 px-4 bg-slate-50">
        <div className="container mx-auto max-w-4xl">
          <h2 className={`text-2xl md:text-3xl font-bold text-center text-slate-900 mb-16 scroll-hidden ${benefitsSection.isVisible ? 'scroll-visible' : ''}`}>
            왜 Cheat Chat AI인가요?
          </h2>

          <div className="grid sm:grid-cols-2 gap-5">
            <Card className={`border-0 shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300 bg-white group cursor-default scroll-hidden stagger-1 ${benefitsSection.isVisible ? 'scroll-visible' : ''}`}>
              <CardContent className="p-6 flex gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center shrink-0 shadow-lg shadow-teal-500/25 group-hover:scale-110 transition-transform">
                  <Clock className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 mb-1">진료 시간 단축</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">
                    차트 작성 시간을 줄이고 환자 소통에 집중하세요.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className={`border-0 shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300 bg-white group cursor-default scroll-hidden stagger-2 ${benefitsSection.isVisible ? 'scroll-visible' : ''}`}>
              <CardContent className="p-6 flex gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-cyan-600 flex items-center justify-center shrink-0 shadow-lg shadow-cyan-500/25 group-hover:scale-110 transition-transform">
                  <Zap className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 mb-1">정확한 기록</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">
                    대화 내용을 누락 없이 차트에 반영합니다.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className={`border-0 shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300 bg-white group cursor-default scroll-hidden stagger-3 ${benefitsSection.isVisible ? 'scroll-visible' : ''}`}>
              <CardContent className="p-6 flex gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/25 group-hover:scale-110 transition-transform">
                  <Shield className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 mb-1">데이터 보안</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">
                    녹음 데이터는 저장되지 않습니다.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className={`border-0 shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300 bg-white group cursor-default scroll-hidden stagger-4 ${benefitsSection.isVisible ? 'scroll-visible' : ''}`}>
              <CardContent className="p-6 flex gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-violet-600 flex items-center justify-center shrink-0 shadow-lg shadow-violet-500/25 group-hover:scale-110 transition-transform">
                  <Stethoscope className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 mb-1">진료과별 최적화</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">
                    진료과에 맞는 차트 양식을 제공합니다.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section ref={ctaSection.ref} className="py-24 px-4 bg-gradient-to-br from-teal-600 to-cyan-600 overflow-hidden">
        <div className="container mx-auto max-w-2xl text-center">
          <h2 className={`text-2xl md:text-3xl font-bold text-white mb-4 scroll-hidden ${ctaSection.isVisible ? 'scroll-visible' : ''}`}>
            지금 바로 체험해보세요
          </h2>
          <p className={`text-teal-100 mb-10 scroll-hidden stagger-1 ${ctaSection.isVisible ? 'scroll-visible' : ''}`}>
            로그인 없이 무료로 사용할 수 있습니다.
          </p>

          <Button
            size="lg"
            onClick={onStart}
            className={`bg-white text-teal-700 hover:bg-teal-50 shadow-xl mb-12 px-8 hover:scale-105 transition-transform scroll-scale-hidden stagger-2 ${ctaSection.isVisible ? 'scroll-scale-visible' : ''}`}
          >
            <Play className="w-5 h-5 mr-2" />
            시작하기
          </Button>

          {/* Email Subscribe */}
          <div className={`bg-white/10 backdrop-blur-sm rounded-2xl p-8 max-w-md mx-auto border border-white/20 scroll-hidden stagger-3 ${ctaSection.isVisible ? 'scroll-visible' : ''}`}>
            <h3 className="font-semibold text-white mb-2">
              정식 출시 알림 받기
            </h3>
            <p className="text-teal-100 text-sm mb-5">
              새로운 기능 소식을 이메일로 받아보세요.
            </p>

            {isSubscribed ? (
              <div className="flex items-center justify-center gap-2 text-white py-2">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                  <Check className="w-4 h-4" />
                </div>
                <span>구독 완료!</span>
              </div>
            ) : (
              <form onSubmit={handleEmailSubmit} className="flex gap-2">
                <Input
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="flex-1 bg-white/20 border-white/30 text-white placeholder:text-teal-200 focus:bg-white/30"
                />
                <Button 
                  type="submit" 
                  disabled={isSubmitting}
                  className="bg-white text-teal-700 hover:bg-teal-50 px-6"
                >
                  {isSubmitting ? '...' : '구독'}
                </Button>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t bg-white">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between text-sm text-slate-500">
            <div className="flex items-center gap-2">
              <div className="bg-gradient-to-br from-teal-500 to-teal-600 text-white p-1 rounded-lg">
                <Stethoscope className="w-4 h-4" />
              </div>
              <span className="font-medium">Cheat Chat AI</span>
            </div>
            <p>© 2026 Utopify Technologies</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
