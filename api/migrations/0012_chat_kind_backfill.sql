-- Chats from before kinds existed: a chat whose first answer was Ayurvedic becomes an Ayurveda chat.
UPDATE conversations SET kind = 'ayurveda'
WHERE kind = 'kosmik' AND id IN (
  SELECT m.conversation_id FROM messages m
  WHERE m.role = 'assistant'
    AND m.created_at = (SELECT MIN(created_at) FROM messages WHERE conversation_id = m.conversation_id AND role = 'assistant')
    AND (m.blocks LIKE '%"type":"ayur-plan"%' OR m.blocks LIKE '%"type":"ayur-intake"%' OR m.blocks LIKE '%"type":"herb%'
      OR m.blocks LIKE '%"type":"ritu"%' OR m.blocks LIKE '%"type":"prakriti"%' OR m.blocks LIKE '%"type":"vikriti"%'
      OR m.blocks LIKE '%"kind":"needs-prakriti"%' OR m.blocks LIKE '%"kind":"needs-vikriti"%')
);
