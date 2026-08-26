import { Navbar } from '../components/landing/Navbar';
import { HeroSection } from '../components/landing/HeroSection';
import { BrokersBar } from '../components/landing/BrokersBar';
import { BentoMatrix } from '../components/landing/BentoMatrix';
import { PandaShowcase } from '../components/landing/PandaShowcase';
import { WorkflowTabs } from '../components/landing/WorkflowTabs';
import { MetricsSection } from '../components/landing/MetricsSection';
import { SignalSimulator } from '../components/landing/SignalSimulator';
import { PricingSection } from '../components/landing/PricingSection';
import { FaqSection } from '../components/landing/FaqSection';
import { Footer } from '../components/landing/Footer';

export function LandingPage() {
  return (
    <div className="min-h-screen bg-[#f8f8f6] text-[#0f172a] font-sans antialiased selection:bg-[#2563eb] selection:text-white">
      {/* 1. Centered Floating Glass Navbar */}
      <Navbar />

      {/* 2. Hero Section (50/50 Bleed Sapphire Blue Partition & TradePanda Scene) */}
      <HeroSection />

      {/* 3. Direct OAuth2 Broker Ecosystem Infinite Logo Marquee */}
      <BrokersBar />

      {/* 4. Bento Matrix (5-Card Core Platform Features) */}
      <BentoMatrix />

      {/* 5. Two-Column TradePanda AI Showcase */}
      <PandaShowcase />

      {/* 6. Interactive Multi-Broker Workflow & Radar Tabs */}
      <WorkflowTabs />

      {/* 7. Massive Sapphire Blue Editorial & Metrics Section */}
      <MetricsSection />

      {/* 8. Live Interactive AI Signal Simulator Dashboard */}
      <SignalSimulator />

      {/* 9. Transparent Desk Pricing Tiers */}
      <PricingSection />

      {/* 10. Frequently Asked Questions Accordion */}
      <FaqSection />

      {/* 11. Dark Sapphire Blue Footer */}
      <Footer />
    </div>
  );
}
