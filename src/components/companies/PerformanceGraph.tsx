'use client';

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

export const PerformanceGraph = () => {
  const options = {
    responsive: true,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    plugins: {
      legend: {
        display: false,
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: {
          color: 'rgba(0, 0, 0, 0.05)',
        },
      },
      x: {
        grid: {
          display: false,
        },
      },
    },
  };

  const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];

  const data = {
    labels,
    datasets: [
      {
        label: 'Performance',
        data: [250, 180, 950, 400, 480, 400],
        borderColor: 'rgb(99, 102, 241)',
        backgroundColor: 'rgba(99, 102, 241, 0.5)',
        tension: 0.4,
      },
      {
        label: 'Benchmark',
        data: [400, 380, 320, 380, 320, 380],
        borderColor: 'rgb(203, 213, 225)',
        backgroundColor: 'rgba(203, 213, 225, 0.5)',
        tension: 0.4,
      },
    ],
  };

  return (
    <div className="h-[300px]">
      <Line options={options} data={data} />
    </div>
  );
}; 