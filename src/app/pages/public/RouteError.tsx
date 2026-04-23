// File purpose:
// Friendly fallback screen for bad routes or router-level errors.
// Replaces the default raw React Router error page with an app-specific message.

import { AlertCircle, ArrowLeft, Home } from "lucide-react";
import { isRouteErrorResponse, useNavigate, useRouteError } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";

export function RouteError() {
  const navigate = useNavigate();
  const error = useRouteError();

  let title = "Page not found";
  let description = "That page does not exist anymore. Use one of the buttons below to get back into the app.";

  if (isRouteErrorResponse(error) && error.status !== 404) {
    title = "Something went wrong";
    description = "The app hit a routing error. Try going back home and opening the page again.";
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
            <Button onClick={() => navigate("/")}>
              <Home className="mr-2 h-4 w-4" />
              Go Home
            </Button>
            <Button onClick={() => navigate(-1)} variant="secondary">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Go Back
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
