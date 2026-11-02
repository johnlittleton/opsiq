import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../renderer/context/AuthContext';
import { hasRestrictedFeatureAccess } from '../renderer/utils/restrictedAccess';
import { getNavigationSections } from './navigationSections';
import opsiqLogo from '../../assets/opsiq-logo.png';
import atlasLogo from '../../assets/atlas-logo.png';
import './NavigationSectionPage.css';

export function NavigationSectionPage() {
  const navigate = useNavigate();
  const { sectionId } = useParams();
  const { userRole, executiveName } = useAuth();
  const sections = useMemo(
    () => getNavigationSections(userRole, hasRestrictedFeatureAccess(executiveName)),
    [userRole, executiveName],
  );
  const section = sections.find((item) => item.id === sectionId);

  if (!section) {
    return (
      <main className="navigation-section-page">
        <h1>Section not available</h1>
      </main>
    );
  }

  return (
    <main className="navigation-section-page">
      <header className="navigation-section-header">
        <div className="navigation-section-title">
          <span>{section.icon} {section.title.toUpperCase()}</span>
          <h1>{section.title}</h1>
          <p>{section.description}</p>
        </div>
      </header>
      <section className="navigation-section-tools" aria-label={`${section.title} tools`}>
        {section.tools.map((tool) => (
          <button type="button" className="navigation-tool-card" key={tool.path} onClick={() => navigate(tool.path)}>
            <span className="navigation-tool-icon" aria-hidden="true">{tool.icon}</span>
            <span className="navigation-tool-copy">
              <strong>{tool.title}</strong>
              <small>{tool.description}</small>
            </span>
            <span className="navigation-tool-arrow" aria-hidden="true">→</span>
          </button>
        ))}
      </section>
      <footer className="navigation-section-brand-footer" aria-label="OpsIQ and ATLAS branding">
        <img className="navigation-section-opsiq-logo" src={opsiqLogo} alt="OpsIQ" />
        <div className="navigation-section-powered-by">
          <span>Powered by</span>
          <img src={atlasLogo} alt="ATLAS Architecture" />
        </div>
      </footer>
    </main>
  );
}
