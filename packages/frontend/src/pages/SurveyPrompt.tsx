import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

export default function SurveyPrompt() {
  const [loading, setLoading] = useState(true);
  const [item, setItem] = useState<any>(null);
  const [selectedValue, setSelectedValue] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    checkSurveyEligibility();
  }, []);

  const checkSurveyEligibility = async () => {
    try {
      const response = await axios.get('/api/survey/prompt');

      if (response.data.showSurvey) {
        setItem(response.data.item);
      } else {
        // No survey to show, redirect
        window.location.href = response.data.redirectTo || '/dashboard';
      }
    } catch (error) {
      console.error('Error checking survey eligibility:', error);
      navigate('/dashboard');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (selectedValue === null) return;

    setSubmitting(true);

    try {
      const response = await axios.post('/api/survey/submit', {
        itemId: item.id,
        value: selectedValue,
        deliveryContext: 'sso_login'
      });

      // Redirect after successful submission
      window.location.href = response.data.redirectTo || '/dashboard';
    } catch (error) {
      console.error('Error submitting survey:', error);
      alert('Error submitting response. Please try again.');
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!item) {
    return null;
  }

  const renderScale = () => {
    switch (item.scaleType) {
      case 'LIKERT_5':
        return (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                onClick={() => setSelectedValue(value)}
                className={`w-full p-4 text-left border rounded-lg transition-colors ${
                  selectedValue === value
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-gray-300 hover:border-primary-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span>{getLikert5Label(value)}</span>
                  <span className="text-gray-400">{value}</span>
                </div>
              </button>
            ))}
          </div>
        );

      case 'EMOJI_5':
        const emojis = ['😞', '🙁', '😐', '🙂', '😊'];
        return (
          <div className="flex justify-center space-x-4">
            {emojis.map((emoji, index) => (
              <button
                key={index}
                onClick={() => setSelectedValue(index)}
                className={`text-5xl p-4 rounded-lg transition-all ${
                  selectedValue === index
                    ? 'bg-primary-50 scale-110'
                    : 'hover:bg-gray-100'
                }`}
              >
                {emoji}
              </button>
            ))}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-2xl w-full">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Quick Check-In
            </h2>
            <p className="text-gray-600">
              Your feedback helps us improve. This will only take a moment.
            </p>
          </div>

          <div className="mb-8">
            <p className="text-lg font-medium text-gray-900 mb-6">
              {item.text}
            </p>

            {renderScale()}
          </div>

          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-500">
              Your response is confidential and will only be shown in aggregate form.
            </p>

            <button
              onClick={handleSubmit}
              disabled={selectedValue === null || submitting}
              className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                selectedValue === null || submitting
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-primary-600 text-white hover:bg-primary-700'
              }`}
            >
              {submitting ? 'Submitting...' : 'Submit'}
            </button>
          </div>
        </div>

        <div className="mt-4 text-center">
          <p className="text-sm text-gray-500">
            Powered by <span className="font-semibold text-primary-600">SignalLoop</span>
          </p>
        </div>
      </div>
    </div>
  );
}

function getLikert5Label(value: number): string {
  const labels: Record<number, string> = {
    1: 'Strongly Disagree',
    2: 'Disagree',
    3: 'Neutral',
    4: 'Agree',
    5: 'Strongly Agree'
  };
  return labels[value] || '';
}
