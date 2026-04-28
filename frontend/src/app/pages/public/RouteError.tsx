// File purpose:
// Friendly fallback screen for bad routes or router-level errors.
// Replaces the default raw React Router error page with an app-specific message.

import { AlertCircle, ArrowLeft, RefreshCw } from "lucide-react";
import { isRouteErrorResponse, useNavigate, useRouteError } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { useAuth } from "../../context/AuthContext";
import { getDefaultPath, getStoredView } from "../../lib/viewMode";

export function RouteError() {
  const navigate = useNavigate();
  const error = useRouteError();
  const { user } = useAuth();
  const appPath = user ? getDefaultPath(getStoredView()) : "/auth";

  let title = "Page not found";
  let description = "That page does not exist anymore. Open the app dashboard or go back to the previous page.";

  if (isRouteErrorResponse(error) && error.status !== 404) {
    title = "Something went wrong";
    description = "The app hit a routing error. Reload once, or open the app dashboard again.";
  } else if (error instanceof Error && /Failed to fetch dynamically imported module|Importing a module script failed/i.test(error.message)) {
    title = "Update needed";
    description = "A new version was deployed while this tab was open. Reload the app to fetch the latest screen.";
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--page-bg)] px-4 py-10">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-[var(--ink)]">
            <AlertCircle className="h-5 w-5 text-[var(--brand-accent)]" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-sm text-[var(--muted)]">{description}</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button onClick={() => window.location.reload()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Reload App
            </Button>
            <Button onClick={() => navigate(appPath)} variant="secondary">
              Open App
            </Button>
            <Button onClick={() => navigate(-1)} variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Go Back
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
