const RULES = [
  {
    name: 'door-assignment',
    test: (text) => /(door|dock|assignment|where do i go)/i.test(text),
    response: 'I can help with that. Enter your appointment number and I will confirm your assigned dock door.',
  },
  {
    name: 'wait-shipping',
    test: (text) => /(wait|shipping|how long|status)/i.test(text),
    response: 'Once your appointment is confirmed, please wait for shipping instructions. AvaQ will announce when loading can begin.',
  },
  {
    name: 'not-found',
    test: (text) => /(not found|missing|no appointment)/i.test(text),
    response: 'No appointment was found yet. Please verify the appointment number and try again or contact shipping.',
  },
];

export const avaqBrainService = {
  async respond(userText, context = []) {
    const input = String(userText || '').trim();
    if (!input) {
      return 'I am ready. Please provide an appointment number to continue check-in.';
    }

    const rule = RULES.find((entry) => entry.test(input));
    if (rule) {
      return rule.response;
    }

    const lastContext = context[context.length - 1]?.message;
    if (lastContext && /appointment/i.test(lastContext)) {
      return 'Please enter the appointment number and I will validate it right away.';
    }

    return 'I can guide your check-in. Enter an appointment number or ask about dock assignment status.';
  },
};
