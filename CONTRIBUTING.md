
# Contribution Guidelines

👋 Welcome, and thanks for your interest in contributing!
This repository hosts an open source implementation of the **IOracle** interface.
The contract is meant to serve as a canonical on-chain pricing layer used in decentralized financial applications.
We value clean code, reproducible tests, and transparent collaboration.

---

## 🧱 Code of Conduct

All contributors are expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md) and maintain a professional, respectful tone in issues and discussions.

---

## ⚙️ Repository Setup

### Prerequisites

* **Node.js** ≥ 18.x
* **Foundry** (`forge`, `cast`) or **Hardhat**
* **Git** ≥ 2.35
* Optional: **Docker** for isolated builds

### Installation

```bash
git clone https://github.com/ubk-finance/oracle.git
cd oracle
npm install
forge install
```

```
npm run build
npm test
npm run coverage
npm run lint
npm run format
```

---

## 🧪 Adding a New Asset or Feed

1. Open a new branch from `main`:

   ```bash
   git checkout -b feat/add-<asset-name>-feed
   ```

2. Register your new feed or vault mapping in the appropriate contract or config file.

3. Add corresponding tests under `/test/unit/` or `/test/integration/`.

4. Ensure all tests pass and coverage does not decrease.

5. Commit with a clear message:

   ```bash
   git commit -m "feat: add <ASSET> Chainlink feed"
   ```

6. Push and open a Pull Request against `main`.

---

## 🔍 Pull Request Guidelines

* PRs **must** target the `main` branch.
* Each PR should address **one logical change**.
* Include detailed descriptions and reasoning for any protocol-level modifications.
* New features or bug fixes **must** include corresponding tests.
* All PRs are reviewed by maintainers before merge.
* CI checks (build, lint, tests) must pass.

---

## 🧰 Development Conventions

| Type           | Convention                                                        | Example                                                    |
| -------------- | ----------------------------------------------------------------- | ---------------------------------------------------------- |
| Branch         | `feat/<feature-name>`                                             | `feat/add-sdai-vault`                                      |
| Branch         | `fix/<issue>`                                                     | `fix/price-decimal-bug`                                    |
| Commit         | Conventional commits                                              | `chore: bump version`, `refactor: simplify resolvePrice()` |
| Solidity style | 4-space indent, explicit visibility, NatSpec for all public funcs | ✅ Required                                                 |

---

## 🧩 Security and Responsible Disclosure

If you find a security issue, **do not** open a public issue.
Instead, email **[admin@ciphercomputernetworks.com](mailto:admin@ciphercomputernetworks.com)** with a detailed description and reproduction steps.
We take all disclosures seriously and respond promptly.

---

## 🪙 License

This repository is released under the [MIT License](LICENSE).
By submitting a contribution, you agree that your work will be licensed under the same terms.

---

## 💬 Questions or Discussions

Open a GitHub Discussion under **Q&A** or join our Telegram community for ongoing development updates.

* **[Repository](https://github.com/ubk-finance/oracle)** 
* **[Telegram](https://t.me/+bUrjYBxbrec2OWFh)** 

Thank you for helping make DeFi more robust and transparent!
