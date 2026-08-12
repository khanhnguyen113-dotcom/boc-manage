'use client';

import { useActionState, useRef } from 'react';
import { Send } from 'lucide-react';

import { createCommentAction } from '@/app/(portal)/work-items/actions';
import { EMPTY_FORM_STATE } from '@/app/(portal)/work-items/form-state';
import { Card, CardBody, CardHeader } from '@/components/ui/primitives';
import { Field, FormError, SubmitButton, Textarea } from '@/components/ui/form';

export function CommentForm({ entityId }: { entityId: string }) {
  const [state, formAction] = useActionState(createCommentAction, EMPTY_FORM_STATE);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <Card>
      <CardHeader
        title="Thêm bình luận"
        description="Người Lead và người thực hiện sẽ nhận thông báo trong ứng dụng."
      />
      <CardBody>
        <form
          ref={formRef}
          action={async (formData) => {
            await formAction(formData);
            formRef.current?.reset();
          }}
          className="space-y-3"
        >
          <input type="hidden" name="entity_type" value="work_item" />
          <input type="hidden" name="entity_id" value={entityId} />

          <FormError message={state.error} />

          <Field label="Nội dung" htmlFor="comment-body" required>
            <Textarea
              id="comment-body"
              name="body"
              rows={4}
              required
              placeholder="Cập nhật tình hình, vướng mắc hoặc quyết định cần ghi nhận…"
            />
          </Field>

          <SubmitButton pendingLabel="Đang gửi…">
            <Send aria-hidden className="size-4" />
            Gửi bình luận
          </SubmitButton>
        </form>
      </CardBody>
    </Card>
  );
}
