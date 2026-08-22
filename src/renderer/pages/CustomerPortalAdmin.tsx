import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../services/config';
import './CustomerPortalAdmin.css';

type Account = { customer: string; pin: string; active: boolean };

export default function CustomerPortalAdmin() {
  const { executiveName, sessionToken } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [customer, setCustomer] = useState('');
  const [pin, setPin] = useState('');
  const [message, setMessage] = useState('');

  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken || ''}` };
  const loadAccounts = async () => {
    const response = await fetch(`${API_BASE}/api/customer-portal/accounts`, { headers });
    if (response.ok) setAccounts(await response.json());
    else setMessage('Only John Littleton can manage customer access.');
  };

  useEffect(() => { void loadAccounts(); }, [sessionToken]);

  const createAccount = async () => {
    const response = await fetch(`${API_BASE}/api/customer-portal/accounts`, { method: 'POST', headers, body: JSON.stringify({ customer, pin }) });
    setMessage(response.ok ? 'Customer access created.' : ((await response.json()).error || 'Unable to create access.'));
    if (response.ok) { setCustomer(''); setPin(''); await loadAccounts(); }
  };

  const updateAccount = async (account: Account, body: { active?: boolean; pin?: string }) => {
    const response = await fetch(`${API_BASE}/api/customer-portal/accounts/${encodeURIComponent(account.customer)}`, { method: 'PUT', headers, body: JSON.stringify(body) });
    setMessage(response.ok ? 'Customer access updated.' : ((await response.json()).error || 'Unable to update access.'));
    if (response.ok) await loadAccounts();
  };

  if (!executiveName?.toLowerCase().includes('john')) return <main className="customer-portal-admin"><h1>Access denied</h1></main>;

  return (
    <main className="customer-portal-admin">
      <h1>Customer portal access</h1>
      <p>Create, disable, or reset customer five-digit PINs.</p>
      <section>
        <input placeholder="Customer name" value={customer} onChange={(event) => setCustomer(event.target.value)} />
        <input inputMode="numeric" maxLength={5} placeholder="Five-digit PIN" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 5))} />
        <button type="button" onClick={() => void createAccount()} disabled={!customer || pin.length !== 5}>Create access</button>
      </section>
      <div className="customer-portal-admin__list">
        {accounts.map((account) => (
          <article key={account.customer}>
            <strong>{account.customer}</strong><span>{account.pin}</span><span>{account.active ? 'Active' : 'Disabled'}</span>
            <button type="button" onClick={() => void updateAccount(account, { active: !account.active })}>{account.active ? 'Disable' : 'Enable'}</button>
            <button type="button" onClick={() => { const nextPin = window.prompt(`New five-digit PIN for ${account.customer}`) || ''; if (/^\d{5}$/.test(nextPin)) void updateAccount(account, { pin: nextPin }); }}>Reset PIN</button>
          </article>
        ))}
      </div>
      {message && <p>{message}</p>}
    </main>
  );
}