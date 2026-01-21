import React, { useState, useEffect } from 'react';
import { apiService } from '../services/apiService';

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
    
    // Update stats every 30 seconds
    const interval = setInterval(fetchStats, 30000);
    
    return () => clearInterval(interval);
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