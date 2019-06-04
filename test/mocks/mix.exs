defmodule StandardVersion.MixProject do
  use Mix.Project
  def project do
    [
      app: :standard_version
      version: "0.0.1",
      elixir: "~> 1.8",
      start_permanent: Mix.env() == :prod,
      deps: deps()
    ]
  end
end