import { createContext, useContext, useReducer } from 'react';

const countries = [
  { id: 1, flag: '🇹🇭', name: 'Thailand', currency: 'THB', system: 'PromptPay', operators: 1 },
  { id: 2, flag: '🇻🇳', name: 'Vietnam', currency: 'VND', system: 'VietQR', operators: 0 },
  { id: 3, flag: '🇲🇾', name: 'Malaysia', currency: 'MYR', system: 'DuitNow QR', operators: 0 },
  { id: 4, flag: '🇮🇩', name: 'Indonesia', currency: 'IDR', system: 'QRIS', operators: 0 },
  { id: 5, flag: '🇸🇬', name: 'Singapore', currency: 'SGD', system: 'PayNow', operators: 0 },
];

const initialState = {
  selectedCountry: countries[0],
};

const SettingsContext = createContext(null);

function settingsReducer(state, action) {
  switch (action.type) {
    case 'SET_COUNTRY':
      return {
        ...state,
        selectedCountry: action.payload,
      };
    default:
      return state;
  }
}

export function SettingsProvider({ children }) {
  const [state, dispatch] = useReducer(settingsReducer, initialState);

  const setCountry = (country) => {
    dispatch({ type: 'SET_COUNTRY', payload: country });
  };

  return (
    <SettingsContext.Provider value={{ ...state, setCountry, countries }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
