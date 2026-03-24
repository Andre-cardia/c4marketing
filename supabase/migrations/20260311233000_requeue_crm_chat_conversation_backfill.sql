BEGIN;

SELECT brain.enqueue_sync_item('crm_chat_conversations', c.id, 'UPDATE')
FROM public.crm_chat_conversations c;

COMMIT;
