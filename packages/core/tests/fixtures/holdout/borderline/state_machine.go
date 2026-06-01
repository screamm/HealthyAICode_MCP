package fsm

import "fmt"

// State represents a named state in the finite state machine.
type State string

const (
	StateIdle       State = "idle"
	StateRunning    State = "running"
	StatePaused     State = "paused"
	StateStopped    State = "stopped"
)

// Event represents a transition trigger.
type Event string

const (
	EventStart  Event = "start"
	EventPause  Event = "pause"
	EventResume Event = "resume"
	EventStop   Event = "stop"
)

// Machine is a simple finite state machine.
type Machine struct {
	current State
}

// NewMachine returns a Machine in the idle state.
func NewMachine() *Machine {
	return &Machine{current: StateIdle}
}

// Current returns the active state.
func (m *Machine) Current() State {
	return m.current
}

// Transition applies an event and returns an error when the transition is invalid.
func (m *Machine) Transition(event Event) error {
	switch m.current {
	case StateIdle:
		if event == EventStart {
			m.current = StateRunning
			return nil
		}
	case StateRunning:
		if event == EventPause {
			m.current = StatePaused
			return nil
		}
		if event == EventStop {
			m.current = StateStopped
			return nil
		}
	case StatePaused:
		if event == EventResume {
			m.current = StateRunning
			return nil
		}
		if event == EventStop {
			m.current = StateStopped
			return nil
		}
	}
	return fmt.Errorf("invalid transition: %s -[%s]-> ?", m.current, event)
}
