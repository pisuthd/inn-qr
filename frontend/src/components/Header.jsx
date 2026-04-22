import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { useSettings } from '../contexts/SettingsContext.jsx';

function Header({ activeTab, onTabChange }) {
  const { selectedCountry, setCountry, countries } = useSettings();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="header">
      <div className="header-content">
        <h1 className="header-logo">
          WeaveLink
        </h1>
        
        {/* Where to spend dropdown */}
        <div className="dropdown-container" ref={dropdownRef}>
          <button 
            onClick={() => setIsOpen(!isOpen)}
            className="dropdown-trigger"
          >
            <span className="dropdown-label">Where to spend</span>
            <span className="dropdown-flag">{selectedCountry.flag}</span>
            <span className="dropdown-country-name">{selectedCountry.name}</span>
            <ChevronDown size={12} className={`dropdown-arrow ${isOpen ? 'rotated' : ''}`} />
          </button>
          
          {isOpen && (
            <div className="dropdown-menu">
              {countries.map((country) => (
                <button
                  key={country.id}
                  onClick={() => {
                    setCountry(country);
                    setIsOpen(false);
                  }}
                  className={`dropdown-item ${selectedCountry.id === country.id ? 'active' : ''}`}
                >
                  <span className="dropdown-item-flag">{country.flag}</span>
                  <div className="dropdown-item-info">
                    <span className="dropdown-item-name">{country.name}</span>
                    <span className="dropdown-item-system">{country.system}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default Header;