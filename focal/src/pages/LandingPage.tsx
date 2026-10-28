import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Scan,
  TrendingUp,
  Shield,
  Smartphone,
  Zap,
  Lock,
  BarChart3,
  Camera,
  Bell,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  PieChart,
  Wallet,
  Github,
  Download,
  CreditCard,
} from "lucide-react";
import { StarsBackground } from "@/components/animate-ui/components/backgrounds/stars";
import { useTheme } from "@/hooks/use-theme";

interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  delay?: number;
}

const FeatureCard: React.FC<FeatureCardProps> = ({
  icon,
  title,
  description,
  delay = 0,
}) => {
  return (
    <Card
      className="group relative overflow-hidden border-border bg-landing-card p-6 transition-all duration-500 hover:shadow-xl hover:shadow-primary/10 hover:-translate-y-1"
      style={{
        animation: `fadeInUp 0.6s ease-out ${delay}s both`,
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
      <div className="relative z-10">
        <div className="mb-4 inline-flex rounded-lg bg-primary/10 p-3 text-primary transition-transform duration-500 group-hover:scale-110">
          {icon}
        </div>
        <h3 className="mb-2 text-xl font-semibold text-foreground">{title}</h3>
        <p className="text-muted-foreground">{description}</p>
      </div>
    </Card>
  );
};

interface StatCardProps {
  value: string;
  label: string;
  delay?: number;
}

const StatCard: React.FC<StatCardProps> = ({ value, label, delay = 0 }) => {
  return (
    <div
      className="text-center"
      style={{
        animation: `fadeInUp 0.6s ease-out ${delay}s both`,
      }}
    >
      <div className="mb-2 text-4xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
        {value}
      </div>
      <div className="text-sm text-muted-foreground">{label}</div>
    </div>
  );
};

export function LandingPage() {
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user) {
      navigate("/home");
    }
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  const features = [
    {
      icon: <Scan className="h-6 w-6" />,
      title: "AI Receipt Scanning",
      description:
        "Instantly digitize receipts with advanced AI vision models. Automatic data extraction and smart categorization with multi-provider support.",
      delay: 0.1,
    },
    {
      icon: <TrendingUp className="h-6 w-6" />,
      title: "Smart Expense Tracking",
      description:
        "Track expenses in real-time with intelligent categorization and spending insights.",
      delay: 0.2,
    },
    {
      icon: <Shield className="h-6 w-6" />,
      title: "Enterprise Security",
      description:
        "JWT-based authentication with bcrypt password hashing, server-side AI processing, and rate limiting.",
      delay: 0.3,
    },
    {
      icon: <Smartphone className="h-6 w-6" />,
      title: "Edge-First PWA",
      description:
        "Deployed on Cloudflare's global network. Install on any device and works offline with seamless sync.",
      delay: 0.4,
    },
    {
      icon: <BarChart3 className="h-6 w-6" />,
      title: "Advanced Analytics",
      description:
        "Visualize spending patterns with interactive charts and personalized financial insights.",
      delay: 0.5,
    },
    {
      icon: <Bell className="h-6 w-6" />,
      title: "Smart Notifications",
      description:
        "Stay on top of your finances with intelligent alerts and budget reminders.",
      delay: 0.6,
    },
  ];

  const benefits = [
    "Open source & free forever",
    "Unlimited receipt scanning",
    "Works offline",
    "Privacy-focused",
    "No ads or tracking",
    "Active community",
  ];

  return (
    <div className="min-h-screen bg-background">
      <style>{`
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
        
        @keyframes float {
          0%, 100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-20px);
          }
        }
        
        @keyframes pulse-glow {
          0%, 100% {
            opacity: 0.5;
          }
          50% {
            opacity: 1;
          }
        }
        
        .animate-float {
          animation: float 6s ease-in-out infinite;
        }
        
        .animate-pulse-glow {
          animation: pulse-glow 3s ease-in-out infinite;
        }
      `}</style>

      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-border">
        {isDark ? (
          <StarsBackground>
            {/* Background Gradients */}
            <div className="absolute inset-0 -z-10">
              <div className="absolute top-0 left-1/4 h-96 w-96 rounded-full bg-primary/20 blur-3xl animate-pulse-glow" />
              <div
                className="absolute bottom-0 right-1/4 h-96 w-96 rounded-full bg-primary/10 blur-3xl animate-pulse-glow"
                style={{ animationDelay: "1.5s" }}
              />
            </div>

            <div className="container mx-auto px-4 py-20 md:py-32">
              <div className="mx-auto max-w-4xl text-center">
                <Badge
                  className="mb-6 border-primary/20 bg-primary/10 text-primary hover:bg-primary/20"
                  style={{ animation: "fadeInUp 0.6s ease-out" }}
                >
                  <Sparkles className="mr-1 h-3 w-3" />
                  AI-Powered Finance Tracking
                </Badge>

                <h1
                  className="mb-6 text-5xl font-bold tracking-tight text-foreground md:text-7xl"
                  style={{ animation: "fadeInUp 0.6s ease-out 0.1s both" }}
                >
                  Master Your Finances with{" "}
                  <span className="bg-gradient-to-r from-primary via-primary/80 to-primary/60 bg-clip-text text-transparent">
                    Focal Finance
                  </span>
                </h1>

                <p
                  className="mb-10 text-lg text-muted-foreground md:text-xl"
                  style={{ animation: "fadeInUp 0.6s ease-out 0.2s both" }}
                >
                  Open-source expense tracker that uses AI to scan receipts,
                  categorize spending, and provide actionable insights. Take
                  control of your financial future today.
                </p>

                <div
                  className="flex flex-col items-center justify-center gap-4 sm:flex-row"
                  style={{ animation: "fadeInUp 0.6s ease-out 0.3s both" }}
                >
                  <Button
                    size="lg"
                    className="group relative overflow-hidden px-8 text-lg"
                    onClick={() => navigate("/login")}
                  >
                    <span className="relative z-10 flex items-center">
                      Get Started
                      <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                    </span>
                    <div className="absolute inset-0 bg-gradient-to-r from-primary to-primary/80 transition-transform group-hover:scale-105" />
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    className="px-8 text-lg"
                    asChild
                  >
                    <a
                      href="https://github.com/Creative-Geek/Focal"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Github className="mr-2 h-5 w-5" />
                      View on GitHub
                    </a>
                  </Button>
                </div>

                {/* Stats */}
                {/* <div
                  className="mt-16 grid grid-cols-3 gap-8 border-t border-border pt-12"
                  style={{ animation: "fadeInUp 0.6s ease-out 0.4s both" }}
                >
                  <StatCard value="50K+" label="Active Users" delay={0.5} />
                  <StatCard value="1M+" label="Receipts Scanned" delay={0.6} />
                  <StatCard value="99.9%" label="Accuracy Rate" delay={0.7} />
                </div> */}
              </div>
            </div>
          </StarsBackground>
        ) : (
          <div className="relative">
            {/* Background Gradients */}
            <div className="absolute inset-0 -z-10">
              <div className="absolute top-0 left-1/4 h-96 w-96 rounded-full bg-primary/20 blur-3xl animate-pulse-glow" />
              <div
                className="absolute bottom-0 right-1/4 h-96 w-96 rounded-full bg-primary/10 blur-3xl animate-pulse-glow"
                style={{ animationDelay: "1.5s" }}
              />
            </div>

            <div className="container mx-auto px-4 py-20 md:py-32">
              <div className="mx-auto max-w-4xl text-center">
                <Badge
                  className="mb-6 border-primary/20 bg-primary/10 text-primary hover:bg-primary/20"
                  style={{ animation: "fadeInUp 0.6s ease-out" }}
                >
                  <Sparkles className="mr-1 h-3 w-3" />
                  Privacy-Focused PWA with AI Vision
                </Badge>

                <h1
                  className="mb-6 text-5xl font-bold tracking-tight text-foreground md:text-7xl"
                  style={{ animation: "fadeInUp 0.6s ease-out 0.1s both" }}
                >
                  Master Your Finances with{" "}
                  <span className="bg-gradient-to-r from-primary via-primary/80 to-primary/60 bg-clip-text text-transparent">
                    Focal
                  </span>
                </h1>

                <p
                  className="mb-10 text-lg text-muted-foreground md:text-xl"
                  style={{ animation: "fadeInUp 0.6s ease-out 0.2s both" }}
                >
                  Modern, privacy-focused expense tracking PWA with AI-powered
                  receipt scanning. Secure, works offline, and deployed on
                  Cloudflare's global network.
                </p>

                <div
                  className="flex flex-col items-center justify-center gap-4 sm:flex-row"
                  style={{ animation: "fadeInUp 0.6s ease-out 0.3s both" }}
                >
                  <Button
                    size="lg"
                    className="group relative overflow-hidden px-8 text-lg"
                    onClick={() => navigate("/login")}
                  >
                    <span className="relative z-10 flex items-center">
                      Get Started
                      <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                    </span>
                    <div className="absolute inset-0 bg-gradient-to-r from-primary to-primary/80 transition-transform group-hover:scale-105" />
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    className="px-8 text-lg"
                    asChild
                  >
                    <a
                      href="https://github.com/Creative-Geek/Focal"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Github className="mr-2 h-5 w-5" />
                      View on GitHub
                    </a>
                  </Button>
                </div>

                {/* Stats */}
                {/* <div
                  className="mt-16 grid grid-cols-3 gap-8 border-t border-border pt-12"
                  style={{ animation: "fadeInUp 0.6s ease-out 0.4s both" }}
                >
                  <StatCard value="50K+" label="Active Users" delay={0.5} />
                  <StatCard value="1M+" label="Receipts Scanned" delay={0.6} />
                  <StatCard value="99.9%" label="Accuracy Rate" delay={0.7} />
                </div> */}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Features Grid */}
      <section id="features" className="container mx-auto px-4 py-20 md:py-32">
        <div className="mb-16 text-center">
          <Badge className="mb-4 border-primary/20 bg-primary/10 text-primary">
            Features
          </Badge>
          <h2 className="mb-4 text-4xl font-bold text-foreground md:text-5xl">
            Everything You Need to Manage Money
          </h2>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
            Powerful features designed to simplify your financial life and help
            you make smarter decisions.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, index) => (
            <FeatureCard key={index} {...feature} />
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section
        id="how-it-works"
        className="border-y border-border bg-muted/30 py-20 md:py-32"
      >
        <div className="container mx-auto px-4">
          <div className="mb-16 text-center">
            <Badge className="mb-4 border-primary/20 bg-primary/10 text-primary">
              Simple Process
            </Badge>
            <h2 className="mb-4 text-4xl font-bold text-foreground md:text-5xl">
              Start Tracking in 3 Easy Steps
            </h2>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            {[
              {
                step: "01",
                icon: <Camera className="h-8 w-8" />,
                title: "Scan Receipt",
                description:
                  "Take a photo of your receipt or upload from gallery. Our AI does the rest.",
              },
              {
                step: "02",
                icon: <Zap className="h-8 w-8" />,
                title: "Auto-Categorize",
                description:
                  "AI automatically extracts data and categorizes your expenses intelligently.",
              },
              {
                step: "03",
                icon: <PieChart className="h-8 w-8" />,
                title: "Track & Analyze",
                description:
                  "View insights, set budgets, and make informed financial decisions.",
              },
            ].map((item, index) => (
              <Card
                key={index}
                className="text-card-foreground flex flex-col gap-6 rounded-xl border shadow-sm relative overflow-hidden border-border bg-landing-card p-8 text-center"
                style={{
                  animation: `fadeInUp 0.6s ease-out ${
                    0.1 * (index + 1)
                  }s both`,
                }}
              >
                <div className="mb-4 text-6xl font-bold text-primary/10">
                  {item.step}
                </div>
                <div className="mb-4 inline-flex rounded-full bg-primary/10 p-4 text-primary">
                  {item.icon}
                </div>
                <h3 className="mb-3 text-2xl font-semibold text-foreground">
                  {item.title}
                </h3>
                <p className="text-muted-foreground">{item.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Security Section */}
      <section id="security" className="container mx-auto px-4 py-20 md:py-32">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <Badge className="mb-4 border-primary/20 bg-primary/10 text-primary">
              <Lock className="mr-1 h-3 w-3" />
              Privacy & Security
            </Badge>
            <h2 className="mb-6 text-4xl font-bold text-foreground md:text-5xl">
              Your Privacy is Protected
            </h2>
            <p className="mb-8 text-lg text-muted-foreground">
              Modern, privacy-focused design with JWT authentication, bcrypt
              password hashing, and AES-256-GCM encryption. Your financial data
              stays secure and private.
            </p>

            <div className="space-y-4">
              {[
                "Server-side AI processing with rate limiting",
                "JWT authentication with bcrypt hashing",
                "SQL injection protection",
                "Input validation with Zod",
                "CORS configuration",
                "Privacy-focused design",
              ].map((item, index) => (
                <div key={index} className="flex items-center gap-3">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                  </div>
                  <span className="text-foreground">{item}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-transparent blur-3xl" />
            <Card className="relative border-border bg-landing-card p-8">
              <div className="grid grid-cols-2 gap-6">
                {[
                  {
                    icon: <Shield className="h-8 w-8" />,
                    label: "SSL Secured",
                  },
                  { icon: <Lock className="h-8 w-8" />, label: "Encrypted" },
                  {
                    icon: <CheckCircle2 className="h-8 w-8" />,
                    label: "Verified",
                  },
                  { icon: <Zap className="h-8 w-8" />, label: "Fast & Safe" },
                ].map((item, index) => (
                  <div
                    key={index}
                    className="flex flex-col items-center justify-center rounded-lg border border-border bg-background p-6 text-center"
                  >
                    <div className="mb-3 text-primary">{item.icon}</div>
                    <div className="text-sm font-medium text-foreground">
                      {item.label}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative overflow-hidden border-y border-border bg-gradient-to-br from-primary/10 via-background to-background py-20 md:py-32">
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-1/2 left-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/20 blur-3xl" />
        </div>

        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center gap-2">
              <Wallet className="h-8 w-8 text-primary" />
              <CreditCard className="h-8 w-8 text-primary animate-float" />
              <BarChart3 className="h-8 w-8 text-primary" />
            </div>

            <h2 className="mb-6 text-4xl font-bold text-foreground md:text-5xl">
              Ready to Take Control of Your Finances?
            </h2>
            <p className="mb-10 text-lg text-muted-foreground">
              Join users worldwide who trust Focal for secure, private expense
              tracking with AI-powered receipt scanning. Free, open-source, and
              works offline.
            </p>

            <div className="mb-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Button
                size="lg"
                className="group px-8 text-lg"
                onClick={() => navigate("/login")}
              >
                <span className="flex items-center">
                  Get Started
                  <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                </span>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="px-8 text-lg"
                asChild
              >
                <a
                  href="https://github.com/Creative-Geek/Focal"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Github className="mr-2 h-5 w-5" />
                  View on GitHub
                </a>
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
              {benefits.map((benefit, index) => (
                <div
                  key={index}
                  className="flex items-center justify-center gap-2 text-sm text-muted-foreground"
                >
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  <span>{benefit}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-muted/30 py-12">
        <div className="container mx-auto px-4">
          <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
            <div className="flex items-center gap-2">
              <img src="/focal-icon.svg" alt="Focal" className="h-10 w-10" />
              <span className="text-xl font-bold text-foreground">Focal</span>
            </div>
            <p className="text-sm text-muted-foreground">
              © 2025 Focal. All rights reserved.
              <br />
              <span className="mt-2 block">Built with ❤️ by Creative Geek</span>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
