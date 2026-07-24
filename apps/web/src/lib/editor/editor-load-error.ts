export class EditorLoadError extends Error {
  readonly code: string;
  readonly projectStatus: string;
  readonly canRetryGeneration: boolean;

  constructor(
    message: string,
    options: { code?: string; projectStatus?: string; canRetryGeneration?: boolean } = {},
  ) {
    super(message);
    this.name = "EditorLoadError";
    this.code = options.code ?? "load_failed";
    this.projectStatus = options.projectStatus ?? "unknown";
    this.canRetryGeneration = options.canRetryGeneration ?? false;
  }
}

export function isEditorLoadError(err: unknown): err is EditorLoadError {
  return err instanceof EditorLoadError;
}
