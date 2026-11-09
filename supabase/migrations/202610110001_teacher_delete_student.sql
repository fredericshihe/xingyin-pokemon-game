BEGIN;

-- Custom table authentication does not provide auth.uid(). This destructive RPC
-- therefore revalidates the teacher's current credential, never just a UUID.
CREATE TABLE IF NOT EXISTS public.teacher_account_deletions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.users(id),
  student_id uuid NOT NULL UNIQUE,
  student_username text NOT NULL,
  deleted_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.teacher_account_deletions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.teacher_account_deletions FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.teacher_delete_student(
  p_teacher_id uuid,
  p_student_id uuid,
  p_teacher_password text,
  p_expected_username text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_student public.users%ROWTYPE;
BEGIN
  IF NULLIF(trim(p_teacher_password), '') IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '请输入你的教师登录密码');
  END IF;
  PERFORM 1 FROM public.users u
    WHERE u.id = p_teacher_id AND u.role = 'teacher'
      AND coalesce(u.registration_status, 'approved') = 'approved'
      AND NULLIF(trim(u.plain_password), '') = trim(p_teacher_password)
    FOR SHARE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '教师身份或密码验证失败');
  END IF;

  SELECT * INTO v_student FROM public.users WHERE id = p_student_id FOR UPDATE;
  IF NOT FOUND THEN
    -- A timeout retry is successful only for this same verified owner and target.
    IF EXISTS (SELECT 1 FROM public.teacher_account_deletions d
      WHERE d.student_id = p_student_id AND d.teacher_id = p_teacher_id
        AND d.student_username = p_expected_username) THEN
      RETURN jsonb_build_object('success', true, 'studentId', p_student_id, 'alreadyDeleted', true);
    END IF;
    RETURN jsonb_build_object('success', false, 'error', '该学生不存在或已被删除');
  END IF;
  IF v_student.role <> 'student' OR v_student.teacher_id IS DISTINCT FROM p_teacher_id
    OR v_student.username IS DISTINCT FROM p_expected_username THEN
    RETURN jsonb_build_object('success', false, 'error', '只能删除自己名下的学生账号，请刷新列表后重试');
  END IF;

  -- Legacy tables have NO ACTION foreign keys. Newer playtime, bank, fishing,
  -- release and gameplay tables already cascade from the locked user row.
  DELETE FROM public.game_saves WHERE user_id = p_student_id;
  DELETE FROM public.teacher_rewards WHERE student_id = p_student_id;
  DELETE FROM public.gold_logs WHERE student_id = p_student_id;
  DELETE FROM public.energy_logs WHERE student_id = p_student_id;
  INSERT INTO public.teacher_account_deletions(teacher_id, student_id, student_username)
    VALUES(p_teacher_id, p_student_id, v_student.username);
  DELETE FROM public.users WHERE id = p_student_id;
  RETURN jsonb_build_object('success', true, 'studentId', p_student_id);
END;
$$;
REVOKE ALL ON FUNCTION public.teacher_delete_student(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.teacher_delete_student(uuid, uuid, text, text) TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
