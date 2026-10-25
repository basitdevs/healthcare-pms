export interface ActionResult {
  ok: boolean;
  message: string;
  ts: number;
}

export type FormAction = (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
