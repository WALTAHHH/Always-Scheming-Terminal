interface Game {
  name: string;
  releaseDate: string;
}

interface PipelineProps {
  games: Game[];
}

export const Pipeline = ({ games }: PipelineProps) => {
  return (
    <div className="space-y-4">
      {games.map((game) => (
        <div key={game.name} className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="font-medium">{game.name}</span>
            <span className="text-sm text-gray-500">{game.releaseDate}</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div 
              className="h-full bg-blue-500 rounded-full"
              style={{ 
                width: game.releaseDate.includes('Q3') ? '75%' : '50%'
              }} 
            />
          </div>
        </div>
      ))}
    </div>
  );
}; 