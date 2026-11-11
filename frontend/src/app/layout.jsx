import { Inter, Silkscreen } from 'next/font/google';
import { ToastProvider } from '@/components/ui/Toast';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
// Pixel font for the "SendPilot" wordmark in the sidebar
const pixel = Silkscreen({ subsets: ['latin'], weight: ['700'], variable: '--font-pixel' });

export const metadata = {
  title: 'SendPilot · Email Scheduler',
  description: 'Reliable email scheduling at scale',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${inter.variable} ${pixel.variable}`}>
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
