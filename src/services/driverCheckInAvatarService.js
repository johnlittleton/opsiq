import { apiClient } from '../renderer/services/api';

const RESULT_KEY = 'avaq.checkin.results';

function readResults() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RESULT_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeResults(results) {
  localStorage.setItem(RESULT_KEY, JSON.stringify(results.slice(0, 50)));
}

function matchesAppointment(appointment, appointmentNumber) {
  const value = String(appointmentNumber || '').trim().toLowerCase();
  const fields = [
    appointment?.id,
    appointment?.appointmentNumber,
    appointment?.referenceNumber,
    appointment?.pickupNumber,
    appointment?.poNumber,
  ]
    .filter(Boolean)
    .map((field) => String(field).trim().toLowerCase());

  return fields.includes(value);
}

function buildSpeech(foundAppointment) {
  if (!foundAppointment) {
    return {
      status: 'not-found',
      lines: [
        'Appointment not found.',
        'Please verify the appointment number or check with shipping.',
      ],
    };
  }

  const assignedDoor = foundAppointment.doorId || foundAppointment.door || 'TBD';
  return {
    status: 'found',
    lines: [
      'Appointment found.',
      `Assigned door is ${assignedDoor}.`,
      'Please wait for shipping to call you forward.',
    ],
    assignedDoor,
  };
}

export const driverCheckInAvatarService = {
  async validateAppointment(appointmentNumber) {
    const appointments = await apiClient.getAppointments();
    const appointment = appointments.find((entry) => matchesAppointment(entry, appointmentNumber)) || null;
    return appointment;
  },

  async runCheckIn(appointmentNumber) {
    const appointment = await this.validateAppointment(appointmentNumber);
    const speech = buildSpeech(appointment);

    const result = {
      id: `avaq_checkin_${Date.now()}`,
      appointmentNumber: String(appointmentNumber || '').trim(),
      status: speech.status,
      assignedDoor: speech.assignedDoor || null,
      appointmentId: appointment?.id || null,
      createdAt: Date.now(),
    };

    this.storeCheckInResult(result);

    return {
      result,
      appointment,
      speech,
    };
  },

  storeCheckInResult(result) {
    const current = readResults();
    writeResults([result, ...current]);
  },

  getRecentResults() {
    return readResults();
  },
};
