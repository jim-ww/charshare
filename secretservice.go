package main

import (
	"errors"

	"github.com/zalando/go-keyring"
)

// The OS credential store (macOS Keychain, Windows Credential Manager, Linux
// Secret Service via D-Bus) lets the desktop build remember the local-data
// encryption passphrase across launches, instead of prompting for it every
// time — an option the plain website build has no equivalent for, since
// browsers have no comparable per-app credential store to reach.
const (
	secretServiceName = "charshare"
	secretServiceUser = "data-encryption-passphrase"
)

// SecretServiceSet stores the passphrase in the OS credential store,
// overwriting any previously-stored value. Returns an error message on
// failure, or "" on success.
func (a *App) SecretServiceSet(passphrase string) string {
	if err := keyring.Set(secretServiceName, secretServiceUser, passphrase); err != nil {
		return err.Error()
	}
	return ""
}

// SecretServiceGet retrieves a previously-stored passphrase. Returns ("",
// "") if nothing has been stored yet — that's an expected, non-error case
// (e.g. first launch, or the user never opted into remembering it) — and
// ("", errorMessage) for any other failure.
func (a *App) SecretServiceGet() (string, string) {
	passphrase, err := keyring.Get(secretServiceName, secretServiceUser)
	if errors.Is(err, keyring.ErrNotFound) {
		return "", ""
	}
	if err != nil {
		return "", err.Error()
	}
	return passphrase, ""
}

// SecretServiceDelete removes any stored passphrase (e.g. when the user
// disables encryption or turns off "remember on this device"). Returns an
// error message on failure, or "" on success — including when nothing was
// stored to begin with.
func (a *App) SecretServiceDelete() string {
	if err := keyring.Delete(secretServiceName, secretServiceUser); err != nil && !errors.Is(err, keyring.ErrNotFound) {
		return err.Error()
	}
	return ""
}
