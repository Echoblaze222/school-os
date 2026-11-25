-- 2026-11-22b chat_messages update guard (already applied to the live Supabase project)
--
-- chat_messages_update_room_members lets ANY room member UPDATE ANY message in the room (the chat UI needs that
-- for emoji reactions). It also let members rewrite or un-delete each other's messages, which weakens every
-- chat, mentoring chats included. Keep the policy so reactions still work and guard the columns instead:
-- non-senders may only change `reactions`; room moderators may also flag a message deleted.

CREATE OR REPLACE FUNCTION public.chat_messages_guard_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  -- service role / SQL editor (no JWT) and the author are unrestricted
  IF auth.uid() IS NULL OR auth.uid() = OLD.sender_id THEN RETURN NEW; END IF;

  IF (NEW.content, NEW.file_url, NEW.file_type, NEW.is_edited, NEW.edited_at, NEW.sender_id,
      NEW.room_id, NEW.reply_to_id, NEW.sent_at, NEW.duration_seconds)
     IS DISTINCT FROM
     (OLD.content, OLD.file_url, OLD.file_type, OLD.is_edited, OLD.edited_at, OLD.sender_id,
      OLD.room_id, OLD.reply_to_id, OLD.sent_at, OLD.duration_seconds) THEN
    RAISE EXCEPTION 'You can only edit your own messages';
  END IF;

  IF NEW.is_deleted IS DISTINCT FROM OLD.is_deleted
     AND NOT public.is_room_moderator(OLD.room_id, auth.uid()) THEN
    RAISE EXCEPTION 'You can only delete your own messages';
  END IF;

  RETURN NEW;
END
$fn$;

CREATE TRIGGER chat_messages_guard_update BEFORE UPDATE ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.chat_messages_guard_update();
