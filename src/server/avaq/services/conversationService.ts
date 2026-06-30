import { AvaQStorageService } from './storageService';
import { OpenAiService } from './openAiService';
import { OpsiqCheckInService } from './opsiqCheckInService';

const extractAfter = (msg: string, key: string): string => {
  const regex = new RegExp(`${key}[:#\\s-]*([A-Za-z0-9-]{2,})`, 'i');
  const m = msg.match(regex);
  return m?.[1] || '';
};

export class AvaQConversationService {
  constructor(
    private readonly storage: AvaQStorageService,
    private readonly ai: OpenAiService,
    private readonly checkIn: OpsiqCheckInService
  ) {}

  async createSession() {
    return this.storage.createSession();
  }

  async addOverride(sessionId: string, by: string, note: string) {
    const session = this.storage.getSession(sessionId);
    if (!session) throw new Error('Session not found');

    session.overrideEvents.push({ at: new Date().toISOString(), by, note });
    session.status = 'escalated';
    this.storage.updateSession(sessionId, session);
    return session;
  }

  async processTurn(sessionId: string, driverMessage: string) {
    const session = this.storage.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const text = String(driverMessage || '').trim();
    if (!text) {
      throw new Error('Driver message is required');
    }

    this.storage.appendMessage(sessionId, 'driver', text);

    const appointmentGuess = extractAfter(text, 'appointment');
    const carrierGuess = extractAfter(text, 'carrier') || extractAfter(text, 'company');
    const driverNameGuess = extractAfter(text, 'driver');

    const nextContext = {
      ...session.context,
      appointmentNumber: session.context.appointmentNumber || appointmentGuess || undefined,
      carrierName: session.context.carrierName || carrierGuess || undefined,
      driverName: session.context.driverName || driverNameGuess || undefined,
      movementType:
        session.context.movementType ||
        (/pickup/i.test(text) ? 'pickup' : /delivery/i.test(text) ? 'delivery' : 'unknown'),
    } as any;

    let appointment: any | null = null;
    if (nextContext.appointmentNumber) {
      appointment = await this.checkIn.lookupAppointment(nextContext.appointmentNumber);
      nextContext.appointmentFound = Boolean(appointment);
      if (appointment) {
        nextContext.appointmentId = appointment.id;
        nextContext.doorNumber = appointment.doorId || appointment.door_id || nextContext.doorNumber;
      }
    }

    let completionPayload: any = null;
    let computedStatus: 'active' | 'completed' | 'escalated' = session.status;

    if (appointment && nextContext.driverName && nextContext.carrierName) {
      const checkin = await this.checkIn.createDriverCheckin({
        appointment,
        driverName: nextContext.driverName,
        carrierName: nextContext.carrierName,
        movementType: nextContext.movementType || 'unknown',
        doorNumber: nextContext.doorNumber,
      });
      nextContext.checkinId = checkin?.checkin?.id || checkin?.id;
      computedStatus = 'completed';
      completionPayload = checkin;
      this.storage.saveCheckinEvent(sessionId, 'completed', { checkinId: nextContext.checkinId });
    }

    const summary = `appointment=${nextContext.appointmentNumber || 'missing'} carrier=${nextContext.carrierName || 'missing'} driver=${nextContext.driverName || 'missing'} movement=${nextContext.movementType || 'unknown'} found=${String(nextContext.appointmentFound || false)} status=${computedStatus}`;

    const aiReply = await this.ai.reply({
      sessionSummary: summary,
      driverMessage: text,
      context: nextContext,
    });

    const fallbackText = appointment && computedStatus === 'completed'
      ? `Thank you. I found your appointment. Please proceed to Door ${nextContext.doorNumber || 'assignment pending'}. Your check-in is complete.`
      : !appointment && nextContext.appointmentNumber
        ? 'I could not find that appointment. Please see shipping.'
        : 'Please say or enter your appointment number, carrier name, and driver name.';

    const replyText = aiReply?.text?.trim() || fallbackText;

    this.storage.appendMessage(sessionId, 'avaq', replyText);
    const updated = this.storage.updateSession(sessionId, {
      status: computedStatus,
      context: nextContext,
    });

    return {
      session: updated,
      assistantText: replyText,
      status: computedStatus,
      completionPayload,
      appointment,
      aiStatus: aiReply.statusTag,
    };
  }
}
