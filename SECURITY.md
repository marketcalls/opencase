# Security Policy

## Reporting a Vulnerability

If you suspect you have found a security vulnerability in OpenCase, please report it responsibly by creating a private security advisory on GitHub or sending an email to the maintainers.

Please include:
- A clear and concise description of the vulnerability
- Where it is exposed in the code
- Steps to reproduce the issue
- Any best practices that might apply to patching it

All reports will be reviewed in a timely manner. If the issue is confirmed, a patch will be released as soon as possible.

## Security Best Practices

When contributing to OpenCase, please follow these security guidelines:

1. **Never commit sensitive data** - API keys, secrets, and credentials should use environment variables
2. **Validate all inputs** - Sanitize user inputs to prevent injection attacks
3. **Use parameterized queries** - Prevent SQL injection by using D1's parameterized queries
4. **Keep dependencies updated** - Regularly update npm packages to patch vulnerabilities
5. **Follow OWASP guidelines** - Be aware of common web security vulnerabilities
