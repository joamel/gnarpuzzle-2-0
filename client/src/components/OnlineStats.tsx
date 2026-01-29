import React, { useState, useEffect } from 'react';
import { apiService } from '../services/apiService';
import { socketService } from '../services/socketService';

interface OnlineStatsProps {
  className?: string;
}

interface OnlineStats {
  total: number;
  authenticated: number;
  anonymous: number;
}

const OnlineStats: React.FC<OnlineStatsProps> = ({ className = '' }) => {
  const [stats, setStats] = useState<OnlineStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchStats = async () => {
    try {
      const response = await apiService.getOnlineStats();
      setStats(response.online);
    } catch (error) {
      console.error('Failed to fetch online stats:', error);
      // Don't show error to user, just fail silently
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();

    // Prefer realtime updates when available
    const handleOnlineStats = (data: any) => {
      if (!data) return;
      const total = Number(data.total);
      const authenticated = Number(data.authenticated);
      const anonymous = Number(data.anonymous);
      if (![total, authenticated, anonymous].every(Number.isFinite)) return;
      setStats({ total, authenticated, anonymous });
      setIsLoading(false);
    };

    socketService.on('stats:online', handleOnlineStats as any);
    
    // Update stats every 30 seconds
    const interval = setInterval(fetchStats, 30000);

    // Also refresh when the tab becomes active again (helps after sleep/backgrounding)
    const handleFocus = () => fetchStats();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchStats();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      socketService.off('stats:online', handleOnlineStats as any);
    };
  }, []);

  if (isLoading || !stats) {
    return null; // Don't show anything while loading
  }

  return (
    <div className={`online-stats ${className}`}>
      <span
        className="online-indicator"
        title={`Konton: ${stats.authenticated}, Gäster/okända: ${stats.anonymous}`}
      >
        🟢 {stats.total} spelare online
      </span>
    </div>
  );
};

export default OnlineStats;