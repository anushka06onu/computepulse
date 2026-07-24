export function PageError({
  message,
  onRetry,
  title = 'Something went wrong',
}: {
  message: string
  onRetry?: () => void
  title?: string
}) {
  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{title}</h1>
          <p>We could not load this view. Check the API and try again.</p>
        </div>
      </div>
      <p className="banner" role="alert">
        {message}
      </p>
      {onRetry ? (
        <button type="button" className="btn btn-primary" onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </div>
  )
}
