import { DocumentTextIcon, SparklesIcon } from '@heroicons/react/24/outline';

export const IntelligenceFeed = () => {
  return (
    <div className="space-y-4">
      <div className="bg-blue-50 p-4 rounded-lg">
        <div className="flex items-start gap-3">
          <SparklesIcon className="w-5 h-5 text-blue-600 mt-1" />
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm text-blue-600">AI-Generated Insight</span>
            </div>
            <p className="text-gray-700">
              EA's focus on live services has driven a 15% increase in player engagement across their top titles,
              suggesting strong revenue potential for Q2 2025.
            </p>
            <p className="text-sm text-gray-500 mt-2">
              Sources: Q1 Earnings Call, Morgan Stanley Report, Gaming Industry Weekly
            </p>
          </div>
        </div>
      </div>

      <div className="p-4">
        <div className="flex items-start gap-3">
          <DocumentTextIcon className="w-5 h-5 text-purple-600 mt-1" />
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm text-purple-600">Strategic Move</span>
            </div>
            <p className="text-gray-700">
              New studio acquisition in Austin suggests expansion into mobile casual gaming market.
            </p>
            <p className="text-sm text-gray-500 mt-2">
              3 related news items
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}; 