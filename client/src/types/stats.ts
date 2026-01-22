export type MyStats = {
  gamesPlayed: number;
  gamesFinished: number;
  wins: number;
  draws: number;
  losses: number;
  totalScore: number;
  bestScore: number;
  averageScore: number;
  totalWordsFound: number;
  lastPlayedAt: string | null;
};

export type MyStatsResponse = {
  success: true;
  user: {
    id: number;
    username: string;
  };
  stats: MyStats;
};
