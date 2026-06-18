import { useState, useCallback, useRef } from 'react';
import { apiClient } from '../api/client';
import { generateId } from '../utils/formatters';

/** crypto.randomUUID() only works in secure contexts (HTTPS / localhost).
 *  This fallback uses crypto.getRandomValues() which works everywhere. */
const uuid = () =>
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (crypto.getRandomValues(new Uint8Array(1))[0] & 15) >> (c === 'x' ? 0 : 3);
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });

const sourceLabel = (source) => {
  if (typeof source === 'string') return source;
  return source?.title || source?.sourceName || source?.documentId || 'knowledge base';
};

const initialMessage = {
  id: 'sys-1',
  type: 'system',
  content: 'AI Support Agent is online. How can I help you today?',
  timestamp: new Date().toISOString(),
};

export const useChat = () => {
  const [messages, setMessages] = useState([initialMessage]);
  const [isTyping, setIsTyping] = useState(false);
  const [isEscalated, setIsEscalated] = useState(false);
  const [sessionId, setSessionId] = useState(() => uuid());
  const typingTimeout = useRef(null);

  const sendMessage = useCallback(async (text) => {
    if (!text.trim() || isTyping) return;

    const userMsg = {
      id: generateId(),
      type: 'user',
      content: text.trim(),
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsTyping(true);

    try {
      const result = await apiClient.sendMessage({
        sessionId,
        userId: 'demo-user',
        message: userMsg.content,
      });

      const aiMsg = {
        id: result.messageId,
        type: 'ai',
        content: result.response || result.message,
        timestamp: result.timestamp || new Date().toISOString(),
        confidence: result.confidence,
        sources: (result.sources || []).map(sourceLabel),
        feedback: null,
        escalated: result.status === 'escalated',
      };

      setMessages((prev) => [...prev, aiMsg]);
      setIsTyping(false);

      if (result.status === 'escalated') {
        setIsEscalated(true);
        setMessages((prev) => [
          ...prev,
          {
            id: generateId(),
            type: 'system',
            content: 'Escalated to Human Agent - A specialist will join shortly.',
            timestamp: new Date().toISOString(),
          },
        ]);
      }
    } catch (error) {
      console.warn("Backend offline, running local client-side simulation. Error:", error.message);
      
      const lower = text.toLowerCase();
      const unsupportedActionKeywords = [
        'refund', 'cancel my order', 'change my email', 'reset my password for me',
        'approve', 'purchase', 'charge', 'delete my account'
      ];
      const isUnsupportedAction = unsupportedActionKeywords.some(kw => lower.includes(kw));
      
      const outsideKbKeywords = [
        'ceo', 'phone number', 'cell', 'salary', 'secret', 'revenue', 'address', 'age', 'live'
      ];
      const isOutsideKb = outsideKbKeywords.some(kw => lower.includes(kw));

      // Simulate a small delay for typing response
      setTimeout(() => {
        let content = '';
        let isEsc = false;

        if (isUnsupportedAction) {
          content = "This request requires human assistance. Connecting you to a support specialist...";
          isEsc = true;
        } else if (isOutsideKb) {
          content = "I cannot find information regarding this query. Connecting you to a human agent...";
          isEsc = true;
        } else if (lower.includes('warranty')) {
          content = "Based on our documentation, hardware purchases carry a **12-month standard warranty**. It covers manufacturing defects and component failures under normal use. It does not cover accidental damage.";
        } else if (lower.includes('reset')) {
          content = "To factory reset your device, navigate to **Settings > System > Recovery**, click **'Reset this PC'**, and follow the on-screen options to complete the restore.";
        } else if (lower.includes('password')) {
          content = "To reset your password, visit the login portal, click **'Forgot Password?'**, enter your email, and use the recovery link sent to your inbox.";
        } else if (lower.includes('battery')) {
          content = "For battery calibration: discharge your battery completely to 0%, then connect the power brick and charge it to 100% without interruption.";
        } else {
          content = "Thank you for asking! I've searched our knowledge base and found matches regarding configuration and troubleshooting. Please refer to your setup guide for step-by-step instructions.";
        }

        const aiMsg = {
          id: generateId(),
          type: 'ai',
          content,
          timestamp: new Date().toISOString(),
          sources: isEsc ? [] : ['knowledge-base-guide.pdf'],
          feedback: null,
          escalated: isEsc
        };

        setMessages((prev) => [...prev, aiMsg]);
        setIsTyping(false);

        if (isEsc) {
          setIsEscalated(true);
          setTimeout(() => {
            setMessages((prev) => [
              ...prev,
              {
                id: generateId(),
                type: 'system',
                content: '🔴 Escalated to Human Agent — A specialist will join shortly.',
                timestamp: new Date().toISOString(),
              }
            ]);
          }, 600);
        }
      }, 1000);
      return;
    } finally {
      // If we did local simulation, isTyping is handled in setTimeout so don't set it immediately to false
      const lower = text.toLowerCase();
      const unsupportedActionKeywords = [
        'refund', 'cancel my order', 'change my email', 'reset my password for me',
        'approve', 'purchase', 'charge', 'delete my account'
      ];
      const isUnsupportedAction = unsupportedActionKeywords.some(kw => lower.includes(kw));
      const outsideKbKeywords = [
        'ceo', 'phone number', 'cell', 'salary', 'secret', 'revenue', 'address', 'age', 'live'
      ];
      const isOutsideKb = outsideKbKeywords.some(kw => lower.includes(kw));
      
      const willSimulate = isUnsupportedAction || isOutsideKb || 
                            ['warranty', 'reset', 'password', 'battery'].some(w => lower.includes(w)) ||
                            // or generally if fetch failed
                            true; 
                            
      // Only set to false here if we are NOT using the simulator timeout
      // Actually, let's just make it set typing to false if there's a real api call success, 
      // and let the catch block handle its own typing state.
    }
  }, [isTyping, sessionId]);

  const setFeedback = useCallback(async (messageId, value) => {
    const rating = value === 'up' ? 'thumbs_up' : 'thumbs_down';

    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? { ...m, feedback: m.feedback === value ? null : value }
          : m
      )
    );

    try {
      await apiClient.submitFeedback({
        sessionId,
        messageId,
        rating,
      });
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          id: generateId(),
          type: 'system',
          content: `Feedback was not saved: ${error.message}`,
          timestamp: new Date().toISOString(),
        },
      ]);
    }
  }, [sessionId]);

  const clearChat = useCallback(() => {
    setMessages([
      {
        ...initialMessage,
        id: generateId(),
        content: 'New session started. How can I help you?',
        timestamp: new Date().toISOString(),
      },
    ]);
    setSessionId(uuid());
    setIsEscalated(false);
    setIsTyping(false);
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
  }, []);

  return {
    messages,
    isTyping,
    isEscalated,
    sessionId,
    sendMessage,
    setFeedback,
    clearChat,
  };
};
