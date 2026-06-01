package router

import (
	"fmt"
	"strings"
)

// Route represents a URL pattern and its handler name.
type Route struct {
	Method  string
	Pattern string
	Handler string
}

// Router holds registered routes and dispatches requests.
type Router struct {
	routes []Route
}

// Register adds a new route to the router.
func (r *Router) Register(method, pattern, handler string) {
	r.routes = append(r.routes, Route{
		Method:  strings.ToUpper(method),
		Pattern: pattern,
		Handler: handler,
	})
}

// Dispatch finds a matching route and returns the handler name.
// Returns an empty string when no route matches.
func (r *Router) Dispatch(method, path string) string {
	method = strings.ToUpper(method)
	for _, route := range r.routes {
		if route.Method != method {
			continue
		}
		if route.Pattern == path {
			return route.Handler
		}
		if strings.HasSuffix(route.Pattern, "/*") {
			prefix := strings.TrimSuffix(route.Pattern, "/*")
			if strings.HasPrefix(path, prefix) {
				return route.Handler
			}
		}
	}
	return ""
}

// DebugRoutes returns a human-readable list of all registered routes.
func (r *Router) DebugRoutes() []string {
	result := make([]string, len(r.routes))
	for i, route := range r.routes {
		result[i] = fmt.Sprintf("[%s] %s -> %s", route.Method, route.Pattern, route.Handler)
	}
	return result
}
